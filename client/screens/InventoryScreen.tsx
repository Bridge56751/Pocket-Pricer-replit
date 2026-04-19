import React, { useState, useCallback, useMemo } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import {
  getInventory,
  addInventoryItem,
  updateInventoryItem,
  removeInventoryItem,
} from "@/lib/storage";
import type { InventoryItem } from "@/types/product";

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
  const { theme } = useDesignTokens();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState<FilterMode>("stock");
  const [addOpen, setAddOpen] = useState(false);
  const [soldOpen, setSoldOpen] = useState<InventoryItem | null>(null);

  const loadItems = useCallback(async () => {
    const data = await getInventory();
    setItems(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
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
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            await removeInventoryItem(item.id);
            await loadItems();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.heroTopFill, { height: insets.top + 200 }]} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
              <Text style={styles.metricLabel}>SPENT</Text>
              <Text style={styles.metricValue}>{formatCurrency(metrics.spent)}</Text>
              <Text style={styles.metricSub}>{items.length} items</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>SOLD</Text>
              <Text style={styles.metricValue}>{formatCurrency(metrics.soldRevenue)}</Text>
              <Text style={styles.metricSub}>{metrics.soldCount} sold</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>PROFIT</Text>
              <Text
                style={[
                  styles.metricValue,
                  { color: metrics.profit >= 0 ? "#4ADE80" : "#F87171" },
                ]}
              >
                {formatCurrency(metrics.profit)}
              </Text>
              <Text style={styles.metricSub}>net realized</Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              setAddOpen(true);
            }}
            style={({ pressed }) => [styles.addButton, { opacity: pressed ? 0.9 : 1 }]}
            testID="button-add-inventory"
          >
            <Feather name="plus" size={18} color="#14532D" />
            <Text style={styles.addButtonText}>Add Item</Text>
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

          {filteredItems.length === 0 ? (
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
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AddItemModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={async () => {
          setAddOpen(false);
          await loadItems();
        }}
      />
      <MarkSoldModal
        item={soldOpen}
        onClose={() => setSoldOpen(null)}
        onSaved={async () => {
          setSoldOpen(null);
          await loadItems();
        }}
      />
    </View>
  );
}

function InventoryCard({
  item,
  onMarkSold,
  onDelete,
}: {
  item: InventoryItem;
  onMarkSold: () => void;
  onDelete: () => void;
}) {
  const { theme } = useDesignTokens();
  const isSold = item.soldPrice !== undefined;
  const profit = isSold ? (item.soldPrice || 0) - item.purchasePrice : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
      <View style={styles.cardImageWrap}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.cardImage} contentFit="cover" />
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

function AddItemModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useDesignTokens();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setPrice("");
    setSaving(false);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedName || isNaN(parsedPrice) || parsedPrice < 0) return;
    setSaving(true);
    await addInventoryItem({
      id: generateId(),
      productName: trimmedName,
      purchasePrice: parsedPrice,
      purchasedAt: new Date().toISOString(),
    });
    reset();
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>Add Item</Text>
          <Text style={[styles.modalSub, { color: theme.colors.mutedForeground }]}>
            Log a purchase you want to track.
          </Text>

          <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>Product name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Nike Air Max 90"
            placeholderTextColor={theme.colors.mutedForeground}
            style={[
              styles.modalInput,
              { color: theme.colors.foreground, borderColor: "#E5E7EB" },
            ]}
            testID="input-product-name"
          />

          <Text style={[styles.modalLabel, { color: theme.colors.foreground }]}>Purchase price</Text>
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
              onPress={() => {
                reset();
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
              disabled={saving || !name.trim() || !price.trim()}
              style={({ pressed }) => [
                styles.modalSaveButton,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: saving || !name.trim() || !price.trim() ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
              testID="button-save-inventory"
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MarkSoldModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useDesignTokens();
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (item) setPrice("");
  }, [item]);

  const handleSave = async () => {
    if (!item) return;
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) return;
    setSaving(true);
    await updateInventoryItem(item.id, {
      soldPrice: parsedPrice,
      soldAt: new Date().toISOString(),
    });
    setSaving(false);
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
});
