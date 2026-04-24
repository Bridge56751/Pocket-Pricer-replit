import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useTabBarFadeOnScroll } from "@/hooks/useTabBarFadeOnScroll";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
  getSearchHistory,
  migrateLocalInventoryToCloud,
  cleanInventoryName,
  INVENTORY_NAME_MAX_LENGTH,
} from "@/lib/storage";
import type { InventoryItem, SearchHistoryItem } from "@/types/product";

type FilterMode = "stock" | "sold";

function formatCurrency(value: number): string {
  if (!isFinite(value)) return "$0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

function generateId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useDesignTokens();
  const { getDeviceId } = useAuth();
  const { isPro, isReady: rcReady } = useRevenueCat();
  const navigation = useNavigation<any>();
  const tabBarFadeHandler = useTabBarFadeOnScroll();
  const scrollRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      const id = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, []),
  );

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<FilterMode>("stock");
  const [addOpen, setAddOpen] = useState(false);
  const [soldOpen, setSoldOpen] = useState<InventoryItem | null>(null);
  const [editNameOpen, setEditNameOpen] = useState<InventoryItem | null>(null);
  const [profitInfoOpen, setProfitInfoOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initError, setInitError] = useState(false);
  const [initAttempt, setInitAttempt] = useState(0);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInitError(false);
        const id = await getDeviceId();
        if (cancelled) return;
        setDeviceId(id);
        await migrateLocalInventoryToCloud(id);
      } catch (err) {
        console.error("Failed to init inventory device id:", err);
        if (!cancelled) setInitError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getDeviceId, initAttempt]);

  // Tracks when we last successfully fetched inventory from the server.
  // Used to suppress redundant focus-refetches that would otherwise flash
  // a loading spinner immediately after a save/reconcile already refreshed
  // the list. Initialised to 0 so the first focus always fetches.
  const lastFetchedAtRef = useRef(0);
  // Mirror of `items` we can read from inside loadItems' callback without
  // adding `items` to its dep array (which would re-create loadItems on
  // every state change and re-fire the focus effect in an infinite loop).
  const itemsRef = useRef<InventoryItem[]>(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const FOCUS_REFETCH_DEDUPE_MS = 2000;

  const loadItems = useCallback(async (opts?: { force?: boolean }) => {
    if (!deviceId) return;
    // Skip if we just fetched (e.g. reconcile() ran moments ago after a save
    // and now the screen is regaining focus). Without this guard the user
    // sees an immediate second fetch on every tab return after a save.
    //
    // The dedupe applies ONLY to the automatic focus refetch. Explicit
    // user-initiated refreshes (Retry button) and post-mutation reloads
    // (modal onSaved callbacks) MUST bypass it via { force: true } —
    // otherwise a fast user could mark an item sold within 2s of opening
    // the app and never see the sold state update until the next tab
    // return.
    if (!opts?.force && Date.now() - lastFetchedAtRef.current < FOCUS_REFETCH_DEDUPE_MS) {
      return;
    }
    // Only show the full-screen spinner when we have nothing on screen yet.
    // Otherwise refresh in the background to avoid a jarring flicker on
    // every tab return.
    if (itemsRef.current.length === 0) setLoadingItems(true);
    try {
      const data = await getInventory(deviceId);
      setItems(data);
      setLoadError(false);
      lastFetchedAtRef.current = Date.now();
    } catch {
      // Keep existing items on failure — wiping the list on a transient
      // network error is worse than showing slightly stale data.
      setLoadError(true);
    } finally {
      setLoadingItems(false);
    }
  }, [deviceId]);

  const reconcileCountRef = useRef(0);
  const reconcile = useCallback(async () => {
    if (!deviceId) return;
    reconcileCountRef.current += 1;
    setReconciling(true);
    try {
      const data = await getInventory(deviceId);
      setItems(data);
      setLoadError(false);
      // Stamp the dedupe clock so the next focus event won't re-fetch the
      // same data we just pulled here.
      lastFetchedAtRef.current = Date.now();
    } catch {
      // Swallow — pill simply hides; user can retry the action.
    } finally {
      reconcileCountRef.current -= 1;
      if (reconcileCountRef.current <= 0) {
        reconcileCountRef.current = 0;
        setReconciling(false);
      }
    }
  }, [deviceId]);

  useFocusEffect(
    useCallback(() => {
      if (deviceId) loadItems();
    }, [deviceId, loadItems])
  );

  const metrics = useMemo(() => {
    const inStock = items.filter(i => i.soldPrice === undefined);
    const sold = items.filter(i => i.soldPrice !== undefined);
    const spent = items.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
    const soldRevenue = sold.reduce((sum, i) => sum + (i.soldPrice || 0), 0);
    const soldCost = sold.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
    const profit = soldRevenue - soldCost;
    return { spent, soldRevenue, profit, inStockCount: inStock.length, soldCount: sold.length };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "stock") return items.filter(i => i.soldPrice === undefined);
    return items.filter(i => i.soldPrice !== undefined);
  }, [items, filter]);

  const handleDelete = (item: InventoryItem) => {
    Alert.alert(
      "Remove item?",
      `Remove "${item.productName}" from your inventory?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!deviceId) return;
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            // Capture the item's original position from inside the setItems
            // updater so it always reflects the freshest state — not the
            // closure value at handler-creation time. If a reconcile or
            // mark-sold has reordered the list while the destructive Alert
            // was open, the rollback still lands at the correct spot.
            let originalIndex = -1;
            setItems(prev => {
              originalIndex = prev.findIndex(i => i.id === item.id);
              return prev.filter(i => i.id !== item.id);
            });
            const ok = await removeInventoryItem(deviceId, item.id);
            if (!ok) {
              // Restore the deleted item locally so the UI matches the server
              // truth even when offline. We also fire reconcile() as a
              // belt-and-suspenders measure for the eventual-consistency case
              // where the delete actually reached the server, but the local
              // restore is what guarantees the user doesn't see their item
              // disappear when they're offline.
              setItems(prev => {
                if (prev.some(i => i.id === item.id)) return prev;
                const next = [...prev];
                const insertAt = originalIndex >= 0 && originalIndex <= next.length
                  ? originalIndex
                  : next.length;
                next.splice(insertAt, 0, item);
                return next;
              });
              Alert.alert("Couldn't remove item", "Please check your connection and try again.");
              reconcile();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: "#F3F4F6" }]}>
      <View style={[styles.heroTopFill, { height: insets.top + 200 }]} />
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        showsVerticalScrollIndicator={false}
        onScroll={tabBarFadeHandler}
        scrollEventThrottle={16}
      >
        <LinearGradient
          colors={["#0A3622", "#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.heroCard, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Feather name="package" size={20} color="#FFFFFF" />
              <Text style={styles.appName}>Inventory</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Track your flips</Text>
          <Text style={styles.heroDescription}>
            Log what you bought, mark items sold, and watch your profit grow.
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel} numberOfLines={1}>SPENT</Text>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatCurrency(metrics.spent)}
              </Text>
              <Text style={styles.metricSub} numberOfLines={1}>All inventory cost</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel} numberOfLines={1}>SOLD</Text>
              <Text
                style={styles.metricValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatCurrency(metrics.soldRevenue)}
              </Text>
              <Text style={styles.metricSub} numberOfLines={1}>Revenue from sold</Text>
            </View>
            <View style={styles.metricCard}>
              <View style={styles.metricLabelRow}>
                <Text
                  style={[styles.metricLabel, styles.metricLabelFlex]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  GROSS PROFIT
                </Text>
                <Pressable
                  onPress={() => setProfitInfoOpen(true)}
                  hitSlop={8}
                  style={styles.metricInfoButton}
                  testID="button-profit-info"
                >
                  <Feather name="info" size={11} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>
              <Text
                style={[
                  styles.metricValue,
                  { color: metrics.profit >= 0 ? "#4ADE80" : "#F87171" },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {formatCurrency(metrics.profit)}
              </Text>
              <Text style={styles.metricSub} numberOfLines={1}>On items sold</Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              // Fail-closed paywall gate: until RevenueCat confirms Pro
              // entitlement (`rcReady && isPro`), treat the user as not-Pro
              // and route them to the Paywall. This prevents a free user from
              // bypassing the gate by tapping "Add Item" during the brief
              // window before RevenueCat finishes initializing.
              if (!rcReady || !isPro) {
                navigation.navigate("Paywall", { context: "inventory" });
                return;
              }
              setAddOpen(true);
            }}
            style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.9 : 1 }]}
            testID="button-add-inventory"
          >
            <Feather
              name={!rcReady || !isPro ? "lock" : "plus"}
              size={18}
              color="#14532D"
            />
            <Text style={styles.addButtonText}>
              {!rcReady || !isPro ? "Unlock Inventory" : "Add Item"}
            </Text>
          </Pressable>
        </LinearGradient>

        <View style={styles.belowHero}>
          <View style={styles.toggleRow}>
            {(["stock", "sold"] as FilterMode[]).map((mode) => {
              const active = filter === mode;
              const label =
                mode === "stock"
                  ? `In Stock (${metrics.inStockCount})`
                  : `Sold (${metrics.soldCount})`;
              return (
                <Pressable
                  key={mode}
                  onPress={() => setFilter(mode)}
                  style={[
                    styles.toggleButton,
                    active && { backgroundColor: theme.colors.primary },
                  ]}
                  testID={`toggle-${mode}`}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: active ? "#FFFFFF" : theme.colors.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {reconciling ? (
            <View
              style={[
                styles.syncPill,
                {
                  backgroundColor: theme.colors.primary + "1A",
                  borderColor: theme.colors.primary + "33",
                },
              ]}
              testID="status-inventory-syncing"
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={[styles.syncPillText, { color: theme.colors.primary }]}>
                Syncing…
              </Text>
            </View>
          ) : null}

          {(initError || loadError) && items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Feather name="alert-circle" size={28} color={theme.colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
                Couldn't load inventory
              </Text>
              <Text style={[styles.emptySub, { color: theme.colors.mutedForeground }]}>
                Check your connection and try again.
              </Text>
              <Pressable
                onPress={() => {
                  if (initError) {
                    setInitAttempt((n) => n + 1);
                  } else {
                    // Explicit user action — bypass dedupe so the Retry
                    // button always actually retries.
                    loadItems({ force: true });
                  }
                }}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: theme.colors.primary,
                }}
                testID="button-inventory-retry"
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
              </Pressable>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Feather
                  name={filter === "stock" ? "package" : "check-circle"}
                  size={28}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
                {filter === "stock" ? "No items yet" : "Nothing sold yet"}
              </Text>
              <Text style={[styles.emptySub, { color: theme.colors.mutedForeground }]}>
                {filter === "stock"
                  ? "Tap Add Item above to log your first purchase."
                  : "Mark items sold from your in-stock list to see them here."}
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {filteredItems.map((item, index) => (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(index * 40).duration(280)}
                >
                  <InventoryCard
                    item={item}
                    onMarkSold={() => setSoldOpen(item)}
                    onDelete={() => handleDelete(item)}
                    onEditName={() => setEditNameOpen(item)}
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      <AddItemModal
        visible={addOpen}
        deviceId={deviceId}
        onClose={() => setAddOpen(false)}
        onSaved={async () => {
          setAddOpen(false);
          // Force-refetch — the new item must appear regardless of how
          // recently the focus effect last fetched.
          await loadItems({ force: true });
        }}
        onWriteFailed={reconcile}
      />
      <MarkSoldModal
        item={soldOpen}
        deviceId={deviceId}
        onClose={() => setSoldOpen(null)}
        onSaved={async () => {
          setSoldOpen(null);
          // Force-refetch — the sold-state transition must be reflected
          // even if the user marked sold within 2s of opening the screen.
          await loadItems({ force: true });
        }}
        onWriteFailed={reconcile}
      />
      <Modal
        visible={profitInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfitInfoOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setProfitInfoOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
            <View style={styles.profitInfoHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Feather name="info" size={18} color={theme.colors.primary} />
                <Text style={[styles.modalTitle, { color: theme.colors.foreground, marginBottom: 0 }]}>
                  How gross profit works
                </Text>
              </View>
              <Pressable
                onPress={() => setProfitInfoOpen(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => [
                  styles.profitInfoClose,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 },
                ]}
                testID="button-close-profit-info"
              >
                <Feather name="x" size={18} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.modalSub, { color: theme.colors.mutedForeground, marginTop: 12, marginBottom: 0 }]}>
              Only counts items you've actually sold — unsold stock isn't a loss. Doesn't subtract platform fees or shipping, so your take-home will be a bit lower.
            </Text>
          </View>
        </View>
      </Modal>
      <EditNameModal
        item={editNameOpen}
        deviceId={deviceId}
        onClose={() => setEditNameOpen(null)}
        onSaved={async (updated) => {
          setEditNameOpen(null);
          if (updated) {
            setItems(prev =>
              prev.map(i => (i.id === updated.id ? { ...i, productName: updated.productName } : i))
            );
          } else {
            // Server didn't echo the updated row — force a refetch so
            // the rename is reflected even if focus just fired.
            await loadItems({ force: true });
          }
        }}
        onWriteFailed={reconcile}
      />
    </View>
  );
}

function InventoryCard({
  item,
  onMarkSold,
  onDelete,
  onEditName,
}: {
  item: InventoryItem;
  onMarkSold: () => void;
  onDelete: () => void;
  onEditName: () => void;
}) {
  const { theme } = useDesignTokens();
  const isSold = item.soldPrice !== undefined;
  const profit = isSold ? (item.soldPrice || 0) - item.purchasePrice : 0;
  // Inventory item thumbnails are 3rd-party URLs (SearchAPI, freeimage.host,
  // imgbb) that can expire or 404 over time. Track load failures so we can
  // show the package fallback icon instead of an empty/broken tile. Reset
  // when the imageUrl actually changes (e.g. user edits the item).
  const [imageFailed, setImageFailed] = useState(false);
  React.useEffect(() => {
    setImageFailed(false);
  }, [item.imageUrl]);
  const showImage = !!item.imageUrl && !imageFailed;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
      <View style={styles.cardImageWrap}>
        {showImage ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.cardImage}
            contentFit="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImageFallback]}>
            <Feather name="package" size={22} color="#9CA3AF" />
          </View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, { color: theme.colors.foreground }]}
          numberOfLines={2}
        >
          {item.productName}
        </Text>
        <View style={styles.cardPriceRow}>
          <View style={styles.cardPriceCol}>
            <Text style={[styles.cardPriceLabel, { color: theme.colors.mutedForeground }]}>
              Paid
            </Text>
            <Text style={[styles.cardPriceValue, { color: theme.colors.foreground }]}>
              {formatCurrency(item.purchasePrice)}
            </Text>
          </View>
          {isSold ? (
            <>
              <View style={styles.cardPriceCol}>
                <Text style={[styles.cardPriceLabel, { color: theme.colors.mutedForeground }]}>
                  Sold
                </Text>
                <Text style={[styles.cardPriceValue, { color: theme.colors.foreground }]}>
                  {formatCurrency(item.soldPrice || 0)}
                </Text>
              </View>
              <View style={styles.cardPriceCol}>
                <Text style={[styles.cardPriceLabel, { color: theme.colors.mutedForeground }]}>
                  Profit
                </Text>
                <Text
                  style={[
                    styles.cardPriceValue,
                    { color: profit >= 0 ? "#047857" : "#DC2626" },
                  ]}
                >
                  {formatCurrency(profit)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.cardActions}>
          {isSold ? (
            <View style={[styles.soldBadge, { backgroundColor: "#DCFCE7" }]}>
              <Feather name="check" size={12} color="#047857" />
              <Text style={[styles.soldBadgeText, { color: "#047857" }]}>Sold</Text>
            </View>
          ) : (
            <Pressable
              onPress={onMarkSold}
              style={({ pressed }) => [
                styles.markSoldButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
              testID={`button-mark-sold-${item.id}`}
            >
              <Feather name="dollar-sign" size={14} color="#FFFFFF" />
              <Text style={styles.markSoldText}>Mark Sold</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onEditName}
            style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.6 : 1 }]}
            testID={`button-edit-name-${item.id}`}
          >
            <Feather name="edit-2" size={15} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.6 : 1 }]}
            testID={`button-delete-${item.id}`}
          >
            <Feather name="trash-2" size={16} color="#DC2626" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function getScanTitle(scan: SearchHistoryItem): string {
  return (
    scan.results?.productInfo?.name ||
    (typeof scan.query === "string" && scan.query) ||
    scan.product?.title ||
    "Product"
  );
}

function getScanThumbnail(scan: SearchHistoryItem): string | undefined {
  return scan.thumbnailUrl || scan.product?.imageUrl || scan.results?.listings?.[0]?.imageUrl;
}

function getScanSuggestedPrice(scan: SearchHistoryItem): number | undefined {
  return scan.bestPrice ?? scan.results?.bestBuyNow ?? scan.avgPrice ?? scan.results?.avgListPrice;
}

type AddMode = "chooser" | "recent";

function AddItemModal({
  visible,
  deviceId,
  onClose,
  onSaved,
  onWriteFailed,
}: {
  visible: boolean;
  deviceId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onWriteFailed?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<AddMode>("chooser");
  const [scans, setScans] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchHistoryItem | null>(null);
  const [price, setPrice] = useState("");
  const [productName, setProductName] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setMode("chooser");
    setSelected(null);
    setPrice("");
    setProductName("");
    setSaving(false);
  }, [visible]);

  React.useEffect(() => {
    if (!visible || mode !== "recent") return;
    let cancelled = false;
    setLoading(true);
    getSearchHistory()
      .then((data) => {
        if (!cancelled) setScans(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, mode]);

  const launchScanFlow = (source: "camera" | "library") => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
    // Defer the navigation so the modal close animation can start cleanly.
    setTimeout(() => {
      navigation.navigate("CameraScan", { source, addToInventory: true });
    }, 50);
  };

  const handleSelect = (scan: SearchHistoryItem) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setSelected(scan);
    const suggested = getScanSuggestedPrice(scan);
    setPrice(suggested && suggested > 0 ? suggested.toFixed(2) : "");
    setProductName(cleanInventoryName(getScanTitle(scan)));
  };

  const handleSave = async () => {
    if (!selected || !deviceId) return;
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) return;
    const trimmedName = productName.trim();
    if (!trimmedName) {
      Alert.alert("Name required", "Please enter a name for this item before saving.");
      return;
    }
    setSaving(true);
    const created = await addInventoryItem(deviceId, {
      id: generateId(),
      productName: trimmedName,
      imageUrl: getScanThumbnail(selected),
      purchasePrice: parsedPrice,
      purchasedAt: new Date().toISOString(),
      sourceProductId: selected.id,
    });
    setSaving(false);
    if (!created) {
      onWriteFailed?.();
      Alert.alert("Couldn't save item", "Please check your connection and try again.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSaved();
  };

  const handleClose = () => {
    setSelected(null);
    setPrice("");
    setProductName("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.sheetBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View
          style={[
            styles.sheetCard,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            {(mode === "recent" || selected) ? (
              <Pressable
                onPress={() => {
                  if (selected) {
                    setSelected(null);
                    setPrice("");
                  } else {
                    setMode("chooser");
                  }
                }}
                hitSlop={10}
                style={styles.sheetBackButton}
                testID="button-back-to-scans"
              >
                <Feather name="chevron-left" size={20} color={theme.colors.foreground} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>
                {selected
                  ? "Set Purchase Price"
                  : mode === "recent"
                  ? "Add from Recent Scans"
                  : "Add Item"}
              </Text>
              <Text style={[styles.modalSub, { color: theme.colors.mutedForeground }]}>
                {selected
                  ? "Enter what you actually paid for this item."
                  : mode === "recent"
                  ? "Pick a recent scan to add to your inventory."
                  : "How do you want to add this flip?"}
              </Text>
            </View>
          </View>

          {mode === "chooser" && !selected ? (
            <View style={styles.chooserList}>
              <Pressable
                onPress={() => launchScanFlow("camera")}
                style={({ pressed }) => [
                  styles.chooserRow,
                  { borderColor: "#E5E7EB", opacity: pressed ? 0.7 : 1 },
                ]}
                testID="chooser-take-photo"
              >
                <View style={[styles.chooserIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Feather name="camera" size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chooserTitle, { color: theme.colors.foreground }]}>
                    Take Photo
                  </Text>
                  <Text style={[styles.chooserSub, { color: theme.colors.mutedForeground }]}>
                    Snap a picture and identify the product.
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              </Pressable>

              <Pressable
                onPress={() => launchScanFlow("library")}
                style={({ pressed }) => [
                  styles.chooserRow,
                  { borderColor: "#E5E7EB", opacity: pressed ? 0.7 : 1 },
                ]}
                testID="chooser-choose-library"
              >
                <View style={[styles.chooserIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Feather name="image" size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chooserTitle, { color: theme.colors.foreground }]}>
                    Choose from Library
                  </Text>
                  <Text style={[styles.chooserSub, { color: theme.colors.mutedForeground }]}>
                    Pick a photo you already took.
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              </Pressable>

              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync();
                  }
                  setMode("recent");
                }}
                style={({ pressed }) => [
                  styles.chooserRow,
                  { borderColor: "#E5E7EB", opacity: pressed ? 0.7 : 1 },
                ]}
                testID="chooser-recent-scans"
              >
                <View style={[styles.chooserIcon, { backgroundColor: "#ECFDF5" }]}>
                  <Feather name="clock" size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.chooserTitle, { color: theme.colors.foreground }]}>
                    From Recent Scans
                  </Text>
                  <Text style={[styles.chooserSub, { color: theme.colors.mutedForeground }]}>
                    Pick something you already scanned.
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              </Pressable>
            </View>
          ) : selected ? (
            <View>
              <View style={[styles.selectedScanRow, { borderColor: "#E5E7EB" }]}>
                {getScanThumbnail(selected) ? (
                  <Image
                    source={{ uri: getScanThumbnail(selected) }}
                    style={styles.selectedScanImage}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.selectedScanImage, styles.cardImageFallback]}>
                    <Feather name="package" size={20} color="#9CA3AF" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.selectedScanTitle, { color: theme.colors.foreground }]}
                    numberOfLines={2}
                  >
                    {productName.trim() || getScanTitle(selected)}
                  </Text>
                  {getScanSuggestedPrice(selected) ? (
                    <Text
                      style={[styles.selectedScanHint, { color: theme.colors.mutedForeground }]}
                    >
                      Market avg: {formatCurrency(getScanSuggestedPrice(selected) || 0)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>
                Product name
              </Text>
              <TextInput
                value={productName}
                onChangeText={setProductName}
                placeholder="Name this item"
                placeholderTextColor={theme.colors.mutedForeground}
                maxLength={INVENTORY_NAME_MAX_LENGTH}
                style={[
                  styles.modalInput,
                  { color: theme.colors.foreground, borderColor: "#E5E7EB" },
                ]}
                testID="input-product-name"
              />

              <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>
                Purchase price
              </Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor={theme.colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[
                  styles.modalInput,
                  { color: theme.colors.foreground, borderColor: "#E5E7EB" },
                ]}
                testID="input-purchase-price"
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={handleClose}
                  style={({ pressed }) => [
                    styles.modalCancelButton,
                    { opacity: pressed ? 0.7 : 1, borderColor: "#E5E7EB" },
                  ]}
                >
                  <Text style={[styles.modalCancelText, { color: theme.colors.foreground }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving || !price.trim() || !productName.trim()}
                  style={({ pressed }) => [
                    styles.modalSaveButton,
                    {
                      backgroundColor: theme.colors.primary,
                      opacity:
                        saving || !price.trim() || !productName.trim()
                          ? 0.5
                          : pressed
                          ? 0.85
                          : 1,
                    },
                  ]}
                  testID="button-save-inventory"
                >
                  <Text style={styles.modalSaveText}>Add to Inventory</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <ScrollView
              style={styles.scanList}
              contentContainerStyle={styles.scanListContent}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View style={styles.scanEmpty}>
                  <Text style={[styles.scanEmptyText, { color: theme.colors.mutedForeground }]}>
                    Loading recent scans…
                  </Text>
                </View>
              ) : scans.length === 0 ? (
                <View style={styles.scanEmpty}>
                  <View style={styles.emptyIconCircle}>
                    <Feather name="camera" size={24} color={theme.colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
                    No scans yet
                  </Text>
                  <Text style={[styles.emptySub, { color: theme.colors.mutedForeground }]}>
                    Scan a product first, then come back here to add it to inventory.
                  </Text>
                </View>
              ) : (
                scans.map((scan) => {
                  const title = getScanTitle(scan);
                  const thumb = getScanThumbnail(scan);
                  const suggested = getScanSuggestedPrice(scan);
                  return (
                    <Pressable
                      key={scan.id}
                      onPress={() => handleSelect(scan)}
                      style={({ pressed }) => [
                        styles.scanRow,
                        { borderColor: "#E5E7EB", opacity: pressed ? 0.7 : 1 },
                      ]}
                      testID={`scan-row-${scan.id}`}
                    >
                      {thumb ? (
                        <Image
                          source={{ uri: thumb }}
                          style={styles.scanRowImage}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.scanRowImage, styles.cardImageFallback]}>
                          <Feather name="package" size={18} color="#9CA3AF" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.scanRowTitle, { color: theme.colors.foreground }]}
                          numberOfLines={2}
                        >
                          {title}
                        </Text>
                        {suggested ? (
                          <Text
                            style={[
                              styles.scanRowHint,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            Market avg {formatCurrency(suggested)}
                          </Text>
                        ) : null}
                      </View>
                      <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MarkSoldModal({
  item,
  deviceId,
  onClose,
  onSaved,
  onWriteFailed,
}: {
  item: InventoryItem | null;
  deviceId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onWriteFailed?: () => void;
}) {
  const { theme } = useDesignTokens();
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (item) setPrice("");
  }, [item]);

  const handleSave = async () => {
    if (!item || !deviceId) return;
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) return;
    setSaving(true);
    const result = await updateInventoryItem(deviceId, item.id, {
      soldPrice: parsedPrice,
      soldAt: new Date().toISOString(),
    });
    setSaving(false);
    if (!result.ok) {
      // If the row was already deleted on the server (e.g. the user deleted
      // the item right before tapping Save), suppress the misleading alert.
      // Reconcile will quietly drop it from the list on the next refresh.
      if (result.notFound) {
        onWriteFailed?.();
        setPrice("");
        onSaved();
        return;
      }
      onWriteFailed?.();
      Alert.alert("Couldn't mark sold", "Please check your connection and try again.");
      return;
    }
    setPrice("");
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSaved();
  };

  const profit = item ? parseFloat(price || "0") - item.purchasePrice : 0;
  const showProfit = !!price && !isNaN(parseFloat(price));

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>Mark Sold</Text>
          <Text style={[styles.modalSub, { color: theme.colors.mutedForeground }]}>
            {item?.productName}
          </Text>

          <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>Sale price</Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            placeholderTextColor={theme.colors.mutedForeground}
            keyboardType="decimal-pad"
            style={[
              styles.modalInput,
              { color: theme.colors.foreground, borderColor: "#E5E7EB" },
            ]}
            testID="input-sale-price"
            autoFocus
          />

          {showProfit ? (
            <View style={styles.profitPreview}>
              <Text style={[styles.profitPreviewLabel, { color: theme.colors.mutedForeground }]}>
                Profit
              </Text>
              <Text
                style={[
                  styles.profitPreviewValue,
                  { color: profit >= 0 ? "#047857" : "#DC2626" },
                ]}
              >
                {formatCurrency(profit)}
              </Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => {
                setPrice("");
                onClose();
              }}
              style={({ pressed }) => [
                styles.modalCancelButton,
                { opacity: pressed ? 0.7 : 1, borderColor: "#E5E7EB" },
              ]}
            >
              <Text style={[styles.modalCancelText, { color: theme.colors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !price.trim()}
              style={({ pressed }) => [
                styles.modalSaveButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: saving || !price.trim() ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              testID="button-save-sold"
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditNameModal({
  item,
  deviceId,
  onClose,
  onSaved,
  onWriteFailed,
}: {
  item: InventoryItem | null;
  deviceId: string | null;
  onClose: () => void;
  onSaved: (updated: InventoryItem | null) => void;
  onWriteFailed?: () => void;
}) {
  const { theme } = useDesignTokens();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (item) setName(item.productName);
  }, [item]);

  const trimmed = name.trim();
  const previewClean = useMemo(() => cleanInventoryName(trimmed), [trimmed]);
  const unchanged = !!item && previewClean === item.productName;

  const handleSave = async () => {
    if (!item || !deviceId) return;
    if (!previewClean) return;
    if (unchanged) {
      onClose();
      return;
    }
    setSaving(true);
    const result = await updateInventoryItem(deviceId, item.id, {
      productName: previewClean,
    });
    setSaving(false);
    if (!result.ok) {
      // If the row was already deleted on the server, suppress the
      // misleading alert and let reconcile drop it from the list quietly.
      if (result.notFound) {
        onWriteFailed?.();
        onSaved(null);
        return;
      }
      onWriteFailed?.();
      Alert.alert("Couldn't save name", "Please check your connection and try again.");
      return;
    }
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onSaved(result.item);
  };

  const showPreview = !!previewClean && previewClean !== trimmed;
  const disableSave = saving || !previewClean || unchanged;

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>Edit name</Text>
          <Text style={[styles.modalSub, { color: theme.colors.mutedForeground }]}>
            Up to {INVENTORY_NAME_MAX_LENGTH} characters.
          </Text>

          <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>Item name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Item name"
            placeholderTextColor={theme.colors.mutedForeground}
            maxLength={INVENTORY_NAME_MAX_LENGTH}
            multiline
            style={[
              styles.modalInput,
              {
                color: theme.colors.foreground,
                borderColor: "#E5E7EB",
                minHeight: 48,
                textAlignVertical: "top",
              },
            ]}
            testID="input-edit-name"
            autoFocus
          />

          {showPreview ? (
            <Text
              style={{
                marginTop: 8,
                fontSize: 12,
                color: theme.colors.mutedForeground,
              }}
            >
              Will be saved as: {previewClean}
            </Text>
          ) : null}

          <View style={styles.modalActions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.modalCancelButton,
                { opacity: pressed ? 0.7 : 1, borderColor: "#E5E7EB" },
              ]}
            >
              <Text style={[styles.modalCancelText, { color: theme.colors.foreground }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={disableSave}
              style={({ pressed }) => [
                styles.modalSaveButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: disableSave ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              testID="button-save-edit-name"
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  heroTopFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0A3622",
  },
  heroCard: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 10,
    color: "#FFFFFF",
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    color: "rgba(255,255,255,0.75)",
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metricLabelFlex: {
    flexShrink: 1,
    marginBottom: 0,
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 4,
  },
  metricInfoButton: {
    padding: 2,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#4ADE80",
  },
  metricSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "rgba(20, 83, 45, 0.3)",
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#14532D",
  },
  belowHero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "#F3F4F6",
  },
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  syncPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardImage: {
    width: 72,
    height: 72,
  },
  cardImageFallback: {
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  cardPriceRow: {
    flexDirection: "row",
    gap: 16,
  },
  cardPriceCol: {
    minWidth: 60,
  },
  cardPriceLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  cardPriceValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  markSoldButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  markSoldText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  soldBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  soldBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 18,
    padding: 22,
  },
  profitInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profitInfoClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 13,
    marginBottom: 18,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  profitPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    marginBottom: 14,
  },
  profitPreviewLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  profitPreviewValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
    maxHeight: "85%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 14,
  },
  sheetBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    marginTop: 2,
  },
  chooserList: {
    gap: 10,
    paddingTop: 4,
  },
  chooserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  chooserIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  chooserTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  chooserSub: {
    fontSize: 13,
    lineHeight: 17,
  },
  scanList: {
    maxHeight: 420,
  },
  scanListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  scanRowImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  scanRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  scanRowHint: {
    fontSize: 12,
    marginTop: 2,
  },
  scanEmpty: {
    alignItems: "center",
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  scanEmptyText: {
    fontSize: 13,
  },
  selectedScanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  selectedScanImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  selectedScanTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  selectedScanHint: {
    fontSize: 12,
    marginTop: 4,
  },
});
