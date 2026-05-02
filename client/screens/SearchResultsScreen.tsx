import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  Linking,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Animated as RNAnimated,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useRoute,
  RouteProp,
  useNavigation,
  CommonActions,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { getImage } from "@/lib/image-store";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type {
  EbaySoldData,
  EbaySoldItem,
  ListingItem,
  RateLimitInfo,
  SearchResultsData,
} from "@/types/product";
import {
  addInventoryItem,
  cleanInventoryName,
  parsePurchasePrice,
} from "@/lib/storage";
import { PurchasePriceSheet } from "@/components/PurchasePriceSheet";
import { ProCapReachedModal } from "@/components/ProCapReachedModal";

function generateInventoryId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type SearchResultsRouteProp = RouteProp<RootStackParamList, "SearchResults">;

export default function SearchResultsScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const route = useRoute<SearchResultsRouteProp>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const results =
    route.params?.results ??
    ({
      query: "",
      totalListings: 0,
      avgListPrice: 0,
      avgSalePrice: null,
      soldCount: 0,
      bestBuyNow: 0,
      topSalePrice: null,
      listings: [],
    } as SearchResultsData);

  const scannedImageUri = useMemo(() => {
    if (results.scannedImageId) {
      return getImage(results.scannedImageId);
    }
    const resultsAny = results as SearchResultsData;
    return resultsAny.scannedImageUri;
  }, [results.scannedImageId, results]);

  const { getDeviceId, getScansUsed } = useAuth();
  const { isPro, isReady: rcReady } = useRevenueCat();
  const addToInventoryMode = route.params?.addToInventory ?? false;

  const rawName = useMemo(() => {
    const raw =
      ((results.productInfo && results.productInfo.name) || "").trim() ||
      (results.query || "").trim() ||
      "";
    return raw;
  }, [results]);

  const brandLine = useMemo(() => {
    const brand = results.productInfo?.brand?.trim();
    if (!brand) return "";
    if (rawName.toLowerCase().includes(brand.toLowerCase())) return "";
    return brand;
  }, [results, rawName]);

  const [savingToInventory, setSavingToInventory] = useState(false);
  const [pricePromptVisible, setPricePromptVisible] = useState(false);
  const [displayName, setDisplayName] = useState(() =>
    cleanInventoryName(rawName),
  );

  useEffect(() => {
    setDisplayName(cleanInventoryName(rawName));
  }, [rawName]);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [sortOption, setSortOption] = useState<string>("Best Match");
  const [ebaySoldData, setEbaySoldData] = useState<EbaySoldData | null>(null);
  const [broadSoldData, setBroadSoldData] = useState<EbaySoldData | null>(null);
  const [ebaySoldLoading, setEbaySoldLoading] = useState(false);
  const [ebaySoldError, setEbaySoldError] = useState<string | null>(null);
  // Group C / P0-8 UX: when the server says we hit a per-Pro monthly cap,
  // surface a cooldown modal instead of the generic "Couldn't reach our
  // pricing service" message. Backend contract is in
  // server/routes.ts > buildEbayRateLimitPayload + the matching client
  // type RateLimitInfo in client/types/product.ts.
  const [proCapHit, setProCapHit] = useState<RateLimitInfo | null>(null);
  const [showEbaySold, setShowEbaySold] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [calcExpanded, setCalcExpanded] = useState(true);

  const scrollY = useRef(new RNAnimated.Value(0)).current;

  const headerWhiteOpacity = scrollY.interpolate({
    inputRange: [0, 100, 180],
    outputRange: [1, 1, 0],
    extrapolate: "clamp",
  });

  const headerDarkOpacity = scrollY.interpolate({
    inputRange: [0, 100, 180],
    outputRange: [0, 0, 1],
    extrapolate: "clamp",
  });

  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [80, 140],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const handleAddToInventory = useCallback(async () => {
    if (savingToInventory) return;
    const deviceId = await getDeviceId();
    if (!deviceId) {
      Alert.alert(
        "Couldn't add item",
        "Device not ready. Please try again in a moment.",
      );
      return;
    }
    const price = parsePurchasePrice(purchasePrice);
    if (price === null) {
      Alert.alert(
        "Invalid price",
        "Enter what you actually paid (a number like 12.50, or 0 for a free find).",
      );
      return;
    }
    const productName = displayName.trim();
    if (!productName) {
      Alert.alert(
        "Name required",
        "Please enter a name for this item before saving.",
      );
      return;
    }
    // Prefer the hosted Supabase URL of the user's actual scan photo so
    // inventory cards show their photo (and so we don't bloat Supabase rows
    // with hundreds of KB of base64). Fall back to the scraped product image
    // if the hosted URL isn't available (e.g. fallback upload host was used).
    const imageUrl =
      results.scannedImageUrl || results.listings?.[0]?.imageUrl || "";

    setSavingToInventory(true);
    const created = await addInventoryItem(deviceId, {
      id: generateInventoryId(),
      productName,
      imageUrl,
      purchasePrice: price,
      purchasedAt: new Date().toISOString(),
      sourceProductId: results.scannedImageId,
    });
    setSavingToInventory(false);

    if (!created) {
      Alert.alert(
        "Couldn't save item",
        "Please check your connection and try again.",
      );
      return;
    }

    // Close the price sheet BEFORE dispatching the navigation reset.
    // PurchasePriceSheet is a React Native <Modal>, which is portaled above
    // every screen. If we leave it visible while resetting to the Inventory
    // tab, the modal stays mounted on top of the new screen and its backdrop
    // intercepts every tap, leaving the user stranded. Setting visible=false
    // here lets the modal unmount before the new screen takes over.
    setPricePromptVisible(false);

    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "MainTabs", params: { screen: "Inventory" } }],
      }),
    );
  }, [
    savingToInventory,
    getDeviceId,
    purchasePrice,
    results,
    scannedImageUri,
    navigation,
    displayName,
  ]);

  const handleOpenPricePrompt = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // Seed the price field with the suggested market price the FIRST time the
    // sheet is opened — but never clobber a value the user already typed (in
    // the inline calculator or in a previous open of this sheet).
    setPurchasePrice((prev) => {
      if (prev && prev.trim().length > 0) return prev;
      const suggested = Number(results.avgListPrice) || 0;
      return suggested > 0 ? suggested.toFixed(2) : "";
    });
    setPricePromptVisible(true);
  }, [results.avgListPrice]);

  const handleClosePricePrompt = useCallback(() => {
    Keyboard.dismiss();
    setPricePromptVisible(false);
  }, []);

  const handleConfirmAddToInventory = useCallback(async () => {
    Keyboard.dismiss();
    await handleAddToInventory();
  }, [handleAddToInventory]);

  const handleGoBack = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (addToInventoryMode) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "MainTabs", params: { screen: "Inventory" } }],
        }),
      );
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("MainTabs", { screen: "Home" });
    }
  }, [navigation, addToInventoryMode]);

  const CUSTOM_HEADER_HEIGHT = 44;

  const suggestedPrice = Number(results.avgListPrice) || 0;
  const EBAY_FEE_RATE = 0.13;

  const calculateProfit = () => {
    const purchase = parseFloat(purchasePrice) || 0;
    const selling = parseFloat(sellingPrice) || suggestedPrice;
    const ebayFees = selling * EBAY_FEE_RATE;
    const profit = selling - purchase - ebayFees;
    const margin = selling > 0 ? Math.round((profit / selling) * 100) : 0;
    return { ebayFees, profit, selling, purchase, margin };
  };

  const { ebayFees, profit, selling, purchase, margin } = calculateProfit();

  const getMarginLabel = (m: number) => {
    if (m >= 60) return "Great margin";
    if (m >= 30) return "Good margin";
    if (m >= 10) return "Low margin";
    return "No margin";
  };

  const buyScore = useMemo(() => {
    if (!ebaySoldData || !showEbaySold) return null;

    const purchase = parseFloat(purchasePrice) || 0;
    const sellPrice =
      parseFloat(sellingPrice) ||
      ebaySoldData.medianSoldPrice ||
      suggestedPrice;
    const fees = sellPrice * EBAY_FEE_RATE;
    const netProfit = sellPrice - purchase - fees;
    const monthlySold = ebaySoldData.avgSoldPerMonth || 0;

    let demandScore = 0;
    if (monthlySold >= 100) {
      demandScore = 40;
    } else if (monthlySold >= 50) {
      demandScore = 35;
    } else if (monthlySold >= 30) {
      demandScore = 30;
    } else if (monthlySold >= 15) {
      demandScore = 22;
    } else if (monthlySold >= 5) {
      demandScore = 14;
    } else if (monthlySold >= 1) {
      demandScore = 6;
    }

    let profitScore = 0;
    if (purchase > 0) {
      if (netProfit <= 0) {
        profitScore = -20;
      } else if (netProfit >= 40) {
        profitScore = 60;
      } else if (netProfit >= 20) {
        profitScore = 40 + ((netProfit - 20) / 20) * 20;
      } else if (netProfit >= 5) {
        profitScore = 10 + ((netProfit - 5) / 15) * 30;
      } else {
        profitScore = (netProfit / 5) * 10;
      }
    } else {
      const medianPrice = ebaySoldData.medianSoldPrice || 0;
      if (medianPrice >= 100) {
        profitScore = 30;
      } else if (medianPrice >= 50) {
        profitScore = 22;
      } else if (medianPrice >= 20) {
        profitScore = 15;
      } else if (medianPrice >= 10) {
        profitScore = 8;
      } else {
        profitScore = 3;
      }
    }

    const raw = Math.round(
      Math.max(0, Math.min(100, profitScore + demandScore)),
    );
    return raw;
  }, [ebaySoldData, showEbaySold, purchasePrice, sellingPrice, suggestedPrice]);

  const getBuyScoreColor = (score: number) => {
    if (score >= 70) return "#22C55E";
    if (score >= 40) return "#F59E0B";
    return "#EF4444";
  };

  const getBuyScoreLabel = (score: number) => {
    if (score >= 80) return "Strong Buy";
    if (score >= 60) return "Good Buy";
    if (score >= 40) return "Fair";
    if (score >= 20) return "Risky";
    return "Avoid";
  };

  const useSuggestedPrice = () => {
    setSellingPrice(suggestedPrice.toFixed(2));
  };

  const handleViewListing = async (link: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (link) {
      await Linking.openURL(link);
    }
  };

  const allListings = Array.isArray(results.listings) ? results.listings : [];

  const sortOptions = [
    "Best Match",
    "eBay Listings",
    "Price: Low to High",
    "Price: High to Low",
  ];

  const sortedListings = useMemo(() => {
    if (sortOption === "Best Match") return [...allListings];
    if (sortOption === "eBay Listings") {
      return allListings.filter((item) =>
        (item.platform || "").toLowerCase().includes("ebay"),
      );
    }
    const priced = allListings.filter((item) => item.currentPrice > 0);
    const noPrice = allListings.filter((item) => item.currentPrice <= 0);
    switch (sortOption) {
      case "Price: Low to High":
        return [
          ...priced.sort((a, b) => a.currentPrice - b.currentPrice),
          ...noPrice,
        ];
      case "Price: High to Low":
        return [
          ...priced.sort((a, b) => b.currentPrice - a.currentPrice),
          ...noPrice,
        ];
      default:
        return [...allListings];
    }
  }, [allListings, sortOption]);

  const handleNewSearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (rcReady && !isPro) {
      const scansUsed = await getScansUsed();
      if (scansUsed >= 3) {
        navigation.navigate("Paywall");
        return;
      }
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: "MainTabs" },
          { name: "CameraScan", params: { source: "camera" } },
        ],
      }),
    );
  };

  const handleEbaySoldSearch = async (broad = false) => {
    // Defensive in-flight guard: if a request is already running, ignore
    // additional taps. Prevents double-tap from spawning duplicate
    // /api/ebay-sold-search requests, racing concurrent results into state,
    // and burning per-device rate-limit + upstream provider quota. Returns
    // before haptics so a disabled tap doesn't even buzz.
    if (ebaySoldLoading) {
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!broad && ebaySoldData) {
      setShowEbaySold(!showEbaySold);
      return;
    }
    if (broad && broadSoldData) {
      return;
    }

    if (rcReady && !isPro) {
      navigation.navigate("Paywall", { context: "ebay" });
      return;
    }

    setEbaySoldLoading(true);
    setEbaySoldError(null);
    const ebayController = new AbortController();
    // Server worst-case: AI cleaning 10s + initial waterfall up to ~30s
    // (SearchAPI 12s timeout, then SerpAPI fallback 18s timeout) + the
    // auto-broaden waterfall when strict returned zero, which adds another
    // ~30s in the worst case. Best/typical case is much faster: SearchAPI
    // returns priced results in 1-2s and SerpAPI is never called.
    // Keep the 50s ceiling — most real requests finish in well under 5s.
    const ebayTimeoutId = setTimeout(() => ebayController.abort(), 50000);
    try {
      const productName = results.productInfo?.name || results.query;
      const deviceId = await getDeviceId();
      const baseUrl = getApiUrl();
      const url = new URL("/api/ebay-sold-search", baseUrl);

      // Pull up to 5 reliable seller listing titles from the scan results
      // already on screen so the AI sees real-world wording, not just our
      // possibly-noisy product name.
      const listingTitles = (results.listings || [])
        .map((l) => (typeof l?.title === "string" ? l.title.trim() : ""))
        .filter((t) => t.length > 0)
        .slice(0, 5);

      const body: {
        searchQuery: string;
        broadSearch?: boolean;
        listingTitles?: string[];
      } = { searchQuery: productName };
      if (broad) body.broadSearch = true;
      if (!broad && listingTitles.length > 0)
        body.listingTitles = listingTitles;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Is-Pro": isPro ? "true" : "false",
        },
        body: JSON.stringify(body),
        signal: ebayController.signal,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.limitReached) {
          navigation.navigate("Paywall", { context: "ebay" });
          return;
        }
        throw new Error(errData.error || "Search failed");
      }
      const raw = await res.json();

      // P0-8 UX: check rateLimit FIRST, before falling into serviceError.
      // The backend includes BOTH `rateLimit` and `serviceError: true` on a
      // cap-hit so old client builds keep showing the existing UI. New
      // builds (this one) detect rateLimit and render the proper cooldown
      // modal with a contact-support release valve.
      if (raw.rateLimit && typeof raw.rateLimit === "object") {
        setProCapHit(raw.rateLimit as RateLimitInfo);
        return;
      }

      // Service-level failure (SearchAPI failed twice) — surface a retry
      // affordance instead of a fake "no results" empty state.
      if (raw.serviceError) {
        setEbaySoldError(
          "Couldn't reach our pricing service. Tap to try again.",
        );
        return;
      }

      const data: EbaySoldData = {
        avgSoldPrice: Number(raw.avgSoldPrice) || 0,
        medianSoldPrice: Number(raw.medianSoldPrice) || 0,
        lowPrice: Number(raw.lowPrice) || 0,
        highPrice: Number(raw.highPrice) || 0,
        totalSold: Number(raw.totalSold) || 0,
        avgSoldPerMonth: Number(raw.avgSoldPerMonth) || 0,
        items: Array.isArray(raw.items)
          ? raw.items.map((item: any) => ({
              ...item,
              price: Number(item.price) || 0,
              id: item.id || String(Math.random()),
            }))
          : [],
        noResults: !!raw.noResults,
        isBroadSearch: !!raw.isBroadSearch,
        broadenedFromStrict: !!raw.broadenedFromStrict,
      };

      if (broad) {
        // Manual "Search Similar Items" path (legacy).
        data.isBroadSearch = true;
        setBroadSoldData(data);
      } else if (data.broadenedFromStrict && data.items.length > 0) {
        // Server transparently auto-broadened after the strict query returned
        // zero results. Surface the broadened payload via the existing
        // "Similar Sales" UI path: empty strict result + populated broad result.
        setEbaySoldData({
          avgSoldPrice: 0,
          medianSoldPrice: 0,
          lowPrice: 0,
          highPrice: 0,
          totalSold: 0,
          avgSoldPerMonth: 0,
          items: [],
          noResults: true,
          broadenedFromStrict: true,
        });
        setBroadSoldData(data);
      } else {
        setEbaySoldData(data);
      }
      setShowEbaySold(true);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setEbaySoldError(
          "Connection lost. Please check your internet and try again.",
        );
      } else {
        setEbaySoldError(err.message || "Failed to load sales data");
      }
    } finally {
      clearTimeout(ebayTimeoutId);
      setEbaySoldLoading(false);
    }
  };

  const handleListOnEbay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const productName =
      typeof results.productInfo === "object"
        ? results.productInfo?.name
        : null;
    const queryStr =
      typeof results.query === "string" ? results.query : "product";
    const searchQuery = encodeURIComponent(productName || queryStr);
    await Linking.openURL(
      `https://www.ebay.com/sl/sell?keyword=${searchQuery}`,
    );
  };

  const handleImageError = (itemId: string) => {
    setBrokenImages((prev) => {
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  };

  const renderSoldImage = (item: EbaySoldItem) => {
    const hasImage =
      item.imageUrl?.trim().length > 0 && !brokenImages.has(item.id);
    if (hasImage) {
      return (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.listingImage}
          contentFit="cover"
          onError={() => handleImageError(item.id)}
        />
      );
    }
    return (
      <View
        style={[
          styles.listingImage,
          styles.imagePlaceholder,
          { backgroundColor: theme.colors.muted },
        ]}
      >
        <Feather
          name="shopping-bag"
          size={28}
          color={theme.colors.mutedForeground}
        />
        <Text
          style={[
            styles.imagePlaceholderText,
            { color: theme.colors.mutedForeground },
          ]}
        >
          Photo unavailable
        </Text>
      </View>
    );
  };

  const getPlatformColor = (platform?: string): string => {
    const p = platform?.toLowerCase() || "";
    if (p.includes("ebay")) return "#3665F3";
    if (p.includes("amazon")) return "#FF9900";
    if (p.includes("walmart")) return "#0071DC";
    if (p.includes("target")) return "#CC0000";
    if (p.includes("mercari")) return "#FF0211";
    if (p.includes("poshmark")) return "#7F0353";
    return "#6B7280";
  };

  const getPlatformName = (platform?: string, seller?: string): string => {
    if (platform) return platform;
    if (seller) {
      const s = seller.toLowerCase();
      if (s.includes("ebay")) return "eBay";
      if (s.includes("amazon")) return "Amazon";
      if (s.includes("walmart")) return "Walmart";
      if (s.includes("target")) return "Target";
      return seller.length > 15 ? seller.substring(0, 15) + "..." : seller;
    }
    return "Shop";
  };

  const renderListing = ({
    item,
    index,
  }: {
    item: ListingItem;
    index: number;
  }) => (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 50).duration(300)}
      style={[styles.listingCard, { backgroundColor: theme.colors.card }]}
    >
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.listingImage}
        contentFit="cover"
      />
      <View style={styles.listingContent}>
        <View
          style={[
            styles.ebayBadge,
            { backgroundColor: getPlatformColor(item.platform || item.seller) },
          ]}
        >
          <Text style={styles.ebayBadgeText}>
            {getPlatformName(item.platform, item.seller)}
          </Text>
        </View>
        <Text
          style={[styles.listingTitle, { color: theme.colors.foreground }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={styles.priceRow}>
          {item.currentPrice > 0 ? (
            <>
              <Text
                style={[
                  styles.currentPrice,
                  { color: theme.colors.foreground },
                ]}
              >
                ${(Number(item.currentPrice) || 0).toFixed(2)}
              </Text>
              {item.originalPrice ? (
                <Text
                  style={[
                    styles.originalPrice,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  ${(Number(item.originalPrice) || 0).toFixed(2)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text
              style={[styles.currentPrice, { color: theme.colors.primary }]}
            >
              Price unlisted
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => handleViewListing(item.link)}
          style={({ pressed }) => [
            styles.viewButton,
            { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather
            name="external-link"
            size={14}
            color={theme.colors.foreground}
          />
          <Text
            style={[styles.viewButtonText, { color: theme.colors.foreground }]}
          >
            View Listing
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <View style={[styles.container]}>
      <View style={styles.topOverscrollBg} />

      <RNAnimated.FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: 0, paddingBottom: 100 },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        data={sortedListings}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={["#0A3622", "#0A3622", "#14532D", "#1A6B3C"]}
              locations={[0, 0.05, 0.5, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[
                styles.heroSection,
                { paddingTop: insets.top + CUSTOM_HEADER_HEIGHT + 8 },
              ]}
            >
              {scannedImageUri ? (
                <View style={styles.productCard}>
                  <Image
                    source={{ uri: scannedImageUri }}
                    style={styles.scannedImageLarge}
                    contentFit="cover"
                  />
                </View>
              ) : null}

              <View style={styles.nameBlock}>
                {brandLine ? (
                  <Text style={styles.heroBrandText} numberOfLines={1}>
                    {brandLine.toUpperCase()}
                  </Text>
                ) : null}
                <View style={styles.nameRow} testID="text-product-name">
                  <Text style={styles.heroNameText} numberOfLines={2}>
                    {displayName.trim() || "Unidentified item"}
                  </Text>
                </View>
              </View>

              <View style={styles.suggestedPriceRow}>
                <View>
                  <Text style={styles.suggestedPriceLabelUpper}>
                    SUGGESTED LISTING PRICE
                  </Text>
                  <Text style={styles.suggestedPriceBig}>
                    ${(Number(results.avgListPrice) || 0).toFixed(0)}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.calculatorNote,
                  {
                    color: "rgba(255,255,255,0.5)",
                    marginTop: 4,
                    marginBottom: 8,
                  },
                ]}
              >
                Based on {results.totalListings || 0} active listings
              </Text>
            </LinearGradient>

            <View style={styles.lightSection}>
              <View style={styles.calculatorCard}>
                <Pressable
                  onPress={() => setCalcExpanded((prev) => !prev)}
                  style={styles.calcHeaderRow}
                >
                  <View style={styles.calculatorHeader}>
                    <Feather name="dollar-sign" size={18} color="#047857" />
                    <Text style={styles.calculatorTitleText}>
                      Profit Calculator
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {!calcExpanded && selling > 0 ? (
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: profit >= 0 ? "#047857" : "#EF4444",
                        }}
                      >
                        {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
                      </Text>
                    ) : profit > 0 ? (
                      <View style={styles.marginBadge}>
                        <Text style={styles.marginBadgeText}>
                          {getMarginLabel(margin)}
                        </Text>
                      </View>
                    ) : null}
                    <Feather
                      name={calcExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#9CA3AF"
                    />
                  </View>
                </Pressable>

                {calcExpanded ? (
                  <>
                    <View style={styles.calcDividerThin} />

                    <View style={styles.calculatorRow}>
                      <View style={styles.labelWithHint}>
                        <Text style={styles.calcLabel}>Your Selling Price</Text>
                        <Pressable
                          onPress={useSuggestedPrice}
                          style={styles.suggestedHint}
                        >
                          <Feather
                            name="corner-down-right"
                            size={12}
                            color="#047857"
                          />
                          <Text style={styles.calcSuggestedText}>
                            Use suggested: ${suggestedPrice.toFixed(0)}
                          </Text>
                        </Pressable>
                      </View>
                      <View style={styles.calcInputBox}>
                        <Text style={styles.calcInputDollar}>$</Text>
                        <TextInput
                          style={styles.calcInputValue}
                          value={sellingPrice}
                          onChangeText={setSellingPrice}
                          placeholder={suggestedPrice.toFixed(0)}
                          placeholderTextColor="#9CA3AF"
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>
                    </View>

                    <View style={styles.calcDividerThin} />

                    <View style={styles.calculatorRow}>
                      <Text style={styles.calcLabel}>Your Purchase Price</Text>
                      <View style={styles.calcInputBox}>
                        <Text style={styles.calcInputDollar}>$</Text>
                        <TextInput
                          style={styles.calcInputValue}
                          value={purchasePrice}
                          onChangeText={setPurchasePrice}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>
                    </View>

                    <View style={styles.calcDividerThin} />

                    <View style={styles.calculatorRow}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text style={styles.calcLabel}>Est. Fees</Text>
                        <View style={styles.feesPill}>
                          <Text style={styles.feesPillText}>~13%</Text>
                        </View>
                      </View>
                      <Text style={styles.calcFeesValue}>
                        -${ebayFees.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.calcDividerThin} />

                    <View
                      style={[
                        styles.profitRow,
                        { backgroundColor: profit > 0 ? "#ECFDF5" : "#FEF2F2" },
                      ]}
                    >
                      <View>
                        <Text
                          style={[
                            styles.profitLabel,
                            { color: profit > 0 ? "#047857" : "#EF4444" },
                          ]}
                        >
                          Estimated eBay Profit
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#6B7280",
                            marginTop: 1,
                          }}
                        >
                          After eBay fees · before shipping
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={[
                            styles.profitValue,
                            { color: profit > 0 ? "#047857" : "#EF4444" },
                          ]}
                        >
                          {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
                        </Text>
                        {profit > 0 ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: "#047857",
                              marginTop: 1,
                            }}
                          >
                            {margin}% margin
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.belowHeroContent}>
                <Pressable
                  testID="button-ebay-sold-search"
                  onPress={() => handleEbaySoldSearch()}
                  disabled={ebaySoldLoading}
                  style={({ pressed }) => [
                    rcReady && !isPro && !ebaySoldData
                      ? styles.salesIntelCardWrapper
                      : styles.ebaySoldButtonPro,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  {ebaySoldLoading ? (
                    <ActivityIndicator size="small" color="#F0D264" />
                  ) : rcReady && !isPro && !ebaySoldData ? (
                    <View style={styles.salesIntelCard}>
                      <View style={styles.salesIntelCardTitleRow}>
                        <Text style={styles.salesIntelCardTitle}>
                          Sales Intelligence
                        </Text>
                        <LinearGradient
                          colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.salesIntelCardProPill}
                        >
                          <Feather name="star" size={9} color="#3D2E00" />
                          <Text style={styles.salesIntelCardProPillText}>
                            PRO
                          </Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.blurredMetricsContainer}>
                        <View style={styles.blurredMetricsRow}>
                          <View style={styles.blurredMetricBox}>
                            <Text style={styles.blurredMetricLabel}>
                              Avg Sold
                            </Text>
                            <View style={styles.redactedBar}>
                              <View
                                style={[styles.redactedBlock, { width: 48 }]}
                              />
                            </View>
                          </View>
                          <View style={styles.blurredMetricBox}>
                            <Text style={styles.blurredMetricLabel}>
                              Buy Score
                            </Text>
                            <View style={styles.redactedBar}>
                              <View
                                style={[styles.redactedBlock, { width: 42 }]}
                              />
                            </View>
                          </View>
                          <View style={styles.blurredMetricBox}>
                            <Text style={styles.blurredMetricLabel}>
                              Sold/mo
                            </Text>
                            <View style={styles.redactedBar}>
                              <View
                                style={[styles.redactedBlock, { width: 28 }]}
                              />
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={styles.salesIntelCtaRow}>
                        <Feather name="lock" size={14} color="#047857" />
                        <Text style={styles.salesIntelCtaText}>
                          See eBay Sales Data
                        </Text>
                        <Feather
                          name="chevron-right"
                          size={16}
                          color="#047857"
                        />
                      </View>
                    </View>
                  ) : (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: 1,
                        gap: 10,
                      }}
                    >
                      <Feather name="trending-up" size={18} color="#F0D264" />
                      <Text style={styles.ebaySoldButtonTextPro}>
                        {ebaySoldData
                          ? showEbaySold
                            ? "Hide Sales Data"
                            : "Show Sales Data"
                          : "See eBay Sales Data"}
                      </Text>
                      <LinearGradient
                        colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 3,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <Feather name="star" size={10} color="#3D2E00" />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: "#3D2E00",
                          }}
                        >
                          PRO
                        </Text>
                      </LinearGradient>
                    </View>
                  )}
                </Pressable>

                {ebaySoldError ? (
                  <Text
                    style={[
                      styles.ebaySoldErrorText,
                      { color: theme.colors.danger },
                    ]}
                  >
                    {ebaySoldError}
                  </Text>
                ) : null}

                {ebaySoldData &&
                showEbaySold &&
                ebaySoldData.noResults &&
                !broadSoldData ? (
                  <View style={styles.advancedSearchContainer}>
                    <View style={styles.salesIntelHeader}>
                      <View style={styles.salesIntelLeft}>
                        <Text style={styles.salesIntelLabel}>PRO FEATURE</Text>
                        <Text style={styles.salesIntelTitle}>
                          Sales Intelligence
                        </Text>
                      </View>
                      <LinearGradient
                        colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.salesIntelBadge}
                      >
                        <Feather name="star" size={10} color="#3D2E00" />
                        <Text style={styles.salesIntelBadgeText}>PRO</Text>
                      </LinearGradient>
                    </View>
                    <View
                      style={[
                        styles.ebaySoldSummary,
                        { backgroundColor: theme.colors.card },
                      ]}
                    >
                      <View style={styles.noResultsEmptyState}>
                        <View style={styles.noResultsIconCircle}>
                          <Feather name="package" size={28} color="#047857" />
                        </View>
                        <Text
                          style={[
                            styles.noResultsTitle,
                            { color: theme.colors.foreground },
                          ]}
                        >
                          No Exact Matches Yet
                        </Text>
                        <Text
                          style={[
                            styles.noResultsDescription,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          We didn't find recent sold listings for this exact
                          product. Try broadening your search to discover
                          similar items.
                        </Text>
                        <Pressable
                          testID="button-broad-ebay-search"
                          style={styles.broadSearchButton}
                          onPress={() => handleEbaySoldSearch(true)}
                          disabled={ebaySoldLoading}
                        >
                          {ebaySoldLoading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Feather
                                name="search"
                                size={16}
                                color="#FFFFFF"
                              />
                              <Text style={styles.broadSearchButtonText}>
                                Search Similar Items
                              </Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : null}

                {ebaySoldData &&
                showEbaySold &&
                ebaySoldData.noResults &&
                broadSoldData &&
                broadSoldData.noResults ? (
                  <View style={styles.advancedSearchContainer}>
                    <View style={styles.salesIntelHeader}>
                      <View style={styles.salesIntelLeft}>
                        <Text style={styles.salesIntelLabel}>PRO FEATURE</Text>
                        <Text style={styles.salesIntelTitle}>
                          Sales Intelligence
                        </Text>
                      </View>
                      <LinearGradient
                        colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.salesIntelBadge}
                      >
                        <Feather name="star" size={10} color="#3D2E00" />
                        <Text style={styles.salesIntelBadgeText}>PRO</Text>
                      </LinearGradient>
                    </View>
                    <View
                      style={[
                        styles.ebaySoldSummary,
                        { backgroundColor: theme.colors.card },
                      ]}
                    >
                      <View style={styles.ebaySoldSummaryHeader}>
                        <Feather name="info" size={18} color="#047857" />
                        <Text
                          style={[
                            styles.ebaySoldSummaryTitle,
                            { color: theme.colors.foreground },
                          ]}
                        >
                          No Similar Items Found
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.ebaySoldSummarySubtitle,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        No sold listings were found for similar items either.
                        This product may be very niche or new to the market.
                      </Text>
                    </View>
                  </View>
                ) : null}

                {ebaySoldData &&
                showEbaySold &&
                !ebaySoldData.noResults &&
                buyScore !== null ? (
                  <View style={styles.advancedSearchContainer}>
                    <View style={styles.salesIntelHeader}>
                      <View style={styles.salesIntelLeft}>
                        <Text style={styles.salesIntelLabel}>PRO FEATURE</Text>
                        <Text style={styles.salesIntelTitle}>
                          Sales Intelligence
                        </Text>
                      </View>
                      <LinearGradient
                        colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.salesIntelBadge}
                      >
                        <Feather name="star" size={10} color="#3D2E00" />
                        <Text style={styles.salesIntelBadgeText}>PRO</Text>
                      </LinearGradient>
                    </View>

                    <Animated.View
                      entering={FadeInDown.duration(400)}
                      style={[
                        styles.buyScoreCard,
                        { backgroundColor: theme.colors.card },
                      ]}
                    >
                      <View style={styles.buyScoreHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.buyScoreSectionLabel}>
                            BUY SCORE
                          </Text>
                          <Text
                            style={[
                              styles.buyScoreHint,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            {parseFloat(purchasePrice) > 0
                              ? "Based on your cost, demand & market data"
                              : "Enter your purchase price for a precise score"}
                          </Text>
                        </View>
                        <View style={styles.buyScoreNumberContainer}>
                          <Text
                            style={[
                              styles.buyScoreValue,
                              { color: getBuyScoreColor(buyScore) },
                            ]}
                          >
                            {buyScore}
                          </Text>
                          <Text
                            style={[
                              styles.buyScoreOutOf,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            /100
                          </Text>
                        </View>
                      </View>

                      <View style={styles.meterContainer}>
                        <View
                          style={[
                            styles.meterTrack,
                            { backgroundColor: theme.colors.muted },
                          ]}
                        >
                          <View
                            style={[styles.meterSegment, styles.meterRed]}
                          />
                          <View
                            style={[styles.meterSegment, styles.meterYellow]}
                          />
                          <View
                            style={[
                              styles.meterSegment,
                              styles.meterGreen,
                              {
                                borderTopRightRadius: 7,
                                borderBottomRightRadius: 7,
                              },
                            ]}
                          />
                        </View>
                        <View
                          style={[
                            styles.meterIndicator,
                            {
                              left: `${Math.max(1, Math.min(98, buyScore))}%`,
                              borderColor: getBuyScoreColor(buyScore),
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.meterLabels}>
                        <Text
                          style={[
                            styles.meterLabelText,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Avoid
                        </Text>
                        <Text
                          style={[
                            styles.meterLabelText,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Risky
                        </Text>
                        <Text
                          style={[
                            styles.meterLabelText,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Fair
                        </Text>
                        <Text
                          style={[
                            styles.meterLabelText,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Good
                        </Text>
                        <Text
                          style={[
                            styles.meterLabelText,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Strong
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.buyScoreLabelRow,
                          {
                            backgroundColor: getBuyScoreColor(buyScore) + "20",
                          },
                        ]}
                      >
                        <Feather
                          name={
                            buyScore >= 60
                              ? "thumbs-up"
                              : buyScore >= 40
                                ? "minus"
                                : "thumbs-down"
                          }
                          size={16}
                          color={getBuyScoreColor(buyScore)}
                        />
                        <Text
                          style={[
                            styles.buyScoreLabelText,
                            { color: getBuyScoreColor(buyScore) },
                          ]}
                        >
                          {getBuyScoreLabel(buyScore)}
                        </Text>
                      </View>
                    </Animated.View>

                    <View
                      style={[
                        styles.ebaySoldSummary,
                        { backgroundColor: theme.colors.card },
                      ]}
                    >
                      <View style={styles.ebaySoldSummaryHeader}>
                        <View style={styles.ebaySoldSummaryHeaderLeft}>
                          <Feather
                            name="trending-up"
                            size={18}
                            color="#047857"
                          />
                          <Text
                            style={[
                              styles.ebaySoldSummaryTitle,
                              { color: theme.colors.foreground },
                            ]}
                          >
                            eBay Sales Summary
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.ebaySoldMatchCount,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        {(ebaySoldData.totalSold || 0).toLocaleString()} sold{" "}
                        {ebaySoldData.totalSold === 1 ? "match" : "matches"}
                      </Text>

                      <View style={styles.ebaySoldStatsRow}>
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            AVG SOLD
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(ebaySoldData.avgSoldPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            mean price
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.ebaySoldStatDivider,
                            { backgroundColor: theme.colors.border },
                          ]}
                        />
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            MEDIAN
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(ebaySoldData.medianSoldPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            midpoint
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.ebaySoldStatDivider,
                            { backgroundColor: theme.colors.border },
                          ]}
                        />
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            RANGE
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(ebaySoldData.lowPrice || 0).toFixed(0)}-$
                            {(ebaySoldData.highPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            low to high
                          </Text>
                        </View>
                      </View>

                      <View
                        style={[
                          styles.avgPerMonthRow,
                          {
                            borderTopWidth: 1,
                            borderTopColor: theme.colors.border,
                          },
                        ]}
                      >
                        <Feather
                          name="activity"
                          size={16}
                          color={theme.colors.mutedForeground}
                        />
                        <Text
                          style={[
                            styles.avgPerMonthLabel,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          Avg sold per month
                        </Text>
                        <Text
                          style={[
                            styles.avgPerMonthValue,
                            {
                              color:
                                (ebaySoldData.avgSoldPerMonth || 0) >= 30
                                  ? "#22C55E"
                                  : (ebaySoldData.avgSoldPerMonth || 0) >= 10
                                    ? "#F59E0B"
                                    : "#047857",
                            },
                          ]}
                        >
                          ~
                          {(ebaySoldData.avgSoldPerMonth || 0) > 0
                            ? (
                                ebaySoldData.avgSoldPerMonth || 0
                              ).toLocaleString()
                            : "0"}
                        </Text>
                        <Text
                          style={[
                            styles.avgPerMonthUnit,
                            { color: theme.colors.mutedForeground },
                          ]}
                        >
                          / mo
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.advancedSectionTitle,
                        { color: "#111827" },
                      ]}
                    >
                      Recent eBay Sales ({(ebaySoldData.items || []).length})
                    </Text>

                    {(ebaySoldData.items || [])
                      .slice(0, 20)
                      .map((item, index) => (
                        <Animated.View
                          key={item.id}
                          entering={FadeInDown.delay(
                            Math.min(index, 5) * 40,
                          ).duration(250)}
                          style={[
                            styles.listingCard,
                            { backgroundColor: theme.colors.card },
                          ]}
                        >
                          {renderSoldImage(item)}
                          <View style={styles.listingContent}>
                            <View
                              style={[
                                styles.ebayBadge,
                                { backgroundColor: "#047857" },
                              ]}
                            >
                              <Text style={styles.ebayBadgeText}>SOLD</Text>
                            </View>
                            <Text
                              style={[
                                styles.listingTitle,
                                { color: theme.colors.foreground },
                              ]}
                              numberOfLines={2}
                            >
                              {item.title}
                            </Text>
                            <View style={styles.priceRow}>
                              <Text
                                style={[
                                  styles.currentPrice,
                                  { color: theme.colors.foreground },
                                ]}
                              >
                                ${(Number(item.price) || 0).toFixed(2)}
                              </Text>
                              {item.condition ? (
                                <Text
                                  style={[
                                    styles.ebaySoldCondition,
                                    { color: theme.colors.mutedForeground },
                                  ]}
                                >
                                  {item.condition}
                                </Text>
                              ) : null}
                            </View>
                            {item.soldDate ? (
                              <Text
                                style={[
                                  styles.ebaySoldDate,
                                  { color: theme.colors.mutedForeground },
                                ]}
                              >
                                {item.soldDate.startsWith("Sold")
                                  ? item.soldDate
                                  : `Sold ${item.soldDate}`}
                              </Text>
                            ) : null}
                            <Pressable
                              onPress={() => handleViewListing(item.link)}
                              style={({ pressed }) => [
                                styles.viewButton,
                                {
                                  backgroundColor: theme.colors.muted,
                                  opacity: pressed ? 0.7 : 1,
                                },
                              ]}
                            >
                              <Feather
                                name="external-link"
                                size={14}
                                color={theme.colors.foreground}
                              />
                              <Text
                                style={[
                                  styles.viewButtonText,
                                  { color: theme.colors.foreground },
                                ]}
                              >
                                View Listing
                              </Text>
                            </Pressable>
                          </View>
                        </Animated.View>
                      ))}

                    <View style={{ height: 8 }} />
                  </View>
                ) : null}

                {broadSoldData && showEbaySold && !broadSoldData.noResults ? (
                  <View style={styles.advancedSearchContainer}>
                    <View style={styles.salesIntelHeader}>
                      <View style={styles.salesIntelLeft}>
                        <Text style={styles.salesIntelLabel}>PRO FEATURE</Text>
                        <Text style={styles.salesIntelTitle}>
                          Sales Intelligence
                        </Text>
                      </View>
                      <LinearGradient
                        colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.salesIntelBadge}
                      >
                        <Feather name="star" size={10} color="#3D2E00" />
                        <Text style={styles.salesIntelBadgeText}>PRO</Text>
                      </LinearGradient>
                    </View>

                    <View style={styles.broadDisclaimerRow}>
                      <Feather
                        name="info"
                        size={14}
                        color={theme.colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.broadDisclaimerText,
                          { color: theme.colors.mutedForeground },
                        ]}
                      >
                        Based on similar items — prices may vary from exact
                        product
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.ebaySoldSummary,
                        { backgroundColor: theme.colors.card },
                      ]}
                    >
                      <Text
                        style={[
                          styles.ebaySoldSummarySubtitle,
                          {
                            color: theme.colors.mutedForeground,
                            marginBottom: 12,
                          },
                        ]}
                      >
                        {(broadSoldData.totalSold || 0).toLocaleString()}{" "}
                        similar sold{" "}
                        {broadSoldData.totalSold === 1 ? "listing" : "listings"}{" "}
                        found
                      </Text>

                      <View style={styles.ebaySoldStatsRow}>
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            AVG SOLD
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(broadSoldData.avgSoldPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            mean price
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.ebaySoldStatDivider,
                            { backgroundColor: theme.colors.border },
                          ]}
                        />
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            MEDIAN
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(broadSoldData.medianSoldPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            midpoint
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.ebaySoldStatDivider,
                            { backgroundColor: theme.colors.border },
                          ]}
                        />
                        <View style={styles.ebaySoldStat}>
                          <Text
                            style={[
                              styles.ebaySoldStatLabel,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            RANGE
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatValue,
                              { color: theme.colors.foreground },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                          >
                            ${(broadSoldData.lowPrice || 0).toFixed(0)}-$
                            {(broadSoldData.highPrice || 0).toFixed(0)}
                          </Text>
                          <Text
                            style={[
                              styles.ebaySoldStatSub,
                              { color: theme.colors.mutedForeground },
                            ]}
                          >
                            low to high
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text
                      style={[
                        styles.advancedSectionTitle,
                        { color: "#111827" },
                      ]}
                    >
                      Similar Sales ({(broadSoldData.items || []).length})
                    </Text>

                    {(broadSoldData.items || [])
                      .slice(0, 15)
                      .map((item, index) => (
                        <Animated.View
                          key={`broad-${item.id}`}
                          entering={FadeInDown.delay(
                            Math.min(index, 5) * 40,
                          ).duration(250)}
                          style={[
                            styles.listingCard,
                            { backgroundColor: theme.colors.card },
                          ]}
                        >
                          {renderSoldImage(item)}
                          <View style={styles.listingContent}>
                            <View
                              style={[
                                styles.ebayBadge,
                                { backgroundColor: "#F59E0B" },
                              ]}
                            >
                              <Text style={styles.ebayBadgeText}>SIMILAR</Text>
                            </View>
                            <Text
                              style={[
                                styles.listingTitle,
                                { color: theme.colors.foreground },
                              ]}
                              numberOfLines={2}
                            >
                              {item.title}
                            </Text>
                            <View style={styles.priceRow}>
                              <Text
                                style={[
                                  styles.currentPrice,
                                  { color: theme.colors.foreground },
                                ]}
                              >
                                ${(Number(item.price) || 0).toFixed(2)}
                              </Text>
                              {item.condition ? (
                                <Text
                                  style={[
                                    styles.ebaySoldCondition,
                                    { color: theme.colors.mutedForeground },
                                  ]}
                                >
                                  {item.condition}
                                </Text>
                              ) : null}
                            </View>
                            {item.soldDate ? (
                              <Text
                                style={[
                                  styles.ebaySoldDate,
                                  { color: theme.colors.mutedForeground },
                                ]}
                              >
                                {item.soldDate.startsWith("Sold")
                                  ? item.soldDate
                                  : `Sold ${item.soldDate}`}
                              </Text>
                            ) : null}
                            <Pressable
                              onPress={() => handleViewListing(item.link)}
                              style={({ pressed }) => [
                                styles.viewButton,
                                {
                                  backgroundColor: theme.colors.muted,
                                  opacity: pressed ? 0.7 : 1,
                                },
                              ]}
                            >
                              <Feather
                                name="external-link"
                                size={14}
                                color={theme.colors.foreground}
                              />
                              <Text
                                style={[
                                  styles.viewButtonText,
                                  { color: theme.colors.foreground },
                                ]}
                              >
                                View Listing
                              </Text>
                            </Pressable>
                          </View>
                        </Animated.View>
                      ))}

                    <View style={{ height: 8 }} />
                  </View>
                ) : null}
              </View>

              <View style={styles.belowHeroContent}>
                <Text style={[styles.sectionTitle, { color: "#111827" }]}>
                  Active Listings ({allListings.length})
                </Text>
              </View>

              {allListings.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.sortContainerFull}
                  contentContainerStyle={styles.sortContentFull}
                >
                  {sortOptions.map((option) => (
                    <Pressable
                      key={option}
                      testID={`button-sort-${option.toLowerCase().replace(/[: ]/g, "-")}`}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSortOption(option);
                      }}
                      style={[
                        styles.sortChip,
                        {
                          backgroundColor:
                            sortOption === option ? "#14532D" : "#F3F4F6",
                          borderColor:
                            sortOption === option ? "#14532D" : "#E5E7EB",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortChipText,
                          {
                            color:
                              sortOption === option ? "#FFFFFF" : "#6B7280",
                          },
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          </View>
        }
        renderItem={renderListing}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: "#9CA3AF" }]}>
              No listings found
            </Text>
          </View>
        }
      />

      {/*
        The Scan Result header is rendered AFTER the FlatList intentionally.
        It's an absolute overlay anchored to the top with zIndex: 2, but on
        iOS the native FlatList (rendered as a sibling without zIndex) was
        winning the touch routing for the header area, so the back-arrow
        Pressable was visually present but completely untappable. Rendering
        the header AFTER the FlatList in JSX makes it both visually and
        touch-wise on top, regardless of how zIndex is honored at the
        native layer.
      */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top,
          left: 0,
          right: 0,
          height: CUSTOM_HEADER_HEIGHT,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          zIndex: 2,
        }}
      >
        <Pressable
          onPress={handleGoBack}
          hitSlop={12}
          testID="button-scan-result-back"
        >
          <View
            style={{
              width: 50,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.6)",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.15,
              shadowRadius: 3,
              overflow: "hidden",
            }}
          >
            <BlurView
              intensity={50}
              tint="light"
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={{ width: 28, height: 28 }}>
                <RNAnimated.View
                  style={{ position: "absolute", opacity: headerWhiteOpacity }}
                >
                  <Feather name="arrow-left" size={28} color="#FFFFFF" />
                </RNAnimated.View>
                <RNAnimated.View
                  style={{ position: "absolute", opacity: headerDarkOpacity }}
                >
                  <Feather name="arrow-left" size={28} color="#111827" />
                </RNAnimated.View>
              </View>
            </BlurView>
          </View>
        </Pressable>
        <View pointerEvents="none" style={{ flex: 1, marginRight: 32 }}>
          <RNAnimated.Text
            style={{
              textAlign: "center",
              fontSize: 17,
              fontWeight: "700",
              color: "#FFFFFF",
              opacity: RNAnimated.multiply(
                headerTitleOpacity,
                headerWhiteOpacity,
              ),
            }}
          >
            Scan Result
          </RNAnimated.Text>
          <RNAnimated.Text
            style={{
              position: "absolute",
              alignSelf: "center",
              fontSize: 17,
              fontWeight: "700",
              color: "#111827",
              opacity: RNAnimated.multiply(
                headerTitleOpacity,
                headerDarkOpacity,
              ),
            }}
          >
            Scan Result
          </RNAnimated.Text>
        </View>
      </View>

      {addToInventoryMode ? (
        <Pressable
          onPress={handleOpenPricePrompt}
          disabled={savingToInventory || !displayName.trim()}
          style={({ pressed }) => [
            styles.newSearchButton,
            {
              backgroundColor: theme.colors.primary,
              bottom: insets.bottom + 16,
              opacity:
                savingToInventory || !displayName.trim()
                  ? 0.5
                  : pressed
                    ? 0.85
                    : 1,
            },
          ]}
          testID="button-add-to-inventory"
        >
          {savingToInventory ? (
            <ActivityIndicator
              size="small"
              color={colors.light.primaryForeground}
            />
          ) : (
            <Feather
              name="plus"
              size={18}
              color={colors.light.primaryForeground}
            />
          )}
          <Text style={styles.newSearchText}>
            {savingToInventory ? "Saving..." : "Add to Inventory"}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={handleNewSearch}
          style={({ pressed }) => [
            styles.newSearchButton,
            {
              backgroundColor: theme.colors.primary,
              bottom: insets.bottom + 16,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name="search"
            size={18}
            color={colors.light.primaryForeground}
          />
          <Text style={styles.newSearchText}>New Search</Text>
        </Pressable>
      )}

      <ProCapReachedModal
        visible={proCapHit !== null}
        rateLimit={proCapHit}
        onClose={() => setProCapHit(null)}
      />

      <PurchasePriceSheet
        visible={pricePromptVisible}
        onClose={handleClosePricePrompt}
        thumbnailUri={
          scannedImageUri ||
          results.scannedImageUrl ||
          results.listings?.[0]?.imageUrl
        }
        displayTitle="Unidentified item"
        marketAverageLabel={
          suggestedPrice > 0 ? `$${suggestedPrice.toFixed(2)}` : null
        }
        name={displayName}
        onNameChange={setDisplayName}
        price={purchasePrice}
        onPriceChange={setPurchasePrice}
        saving={savingToInventory}
        onCancel={handleClosePricePrompt}
        onSave={handleConfirmAddToInventory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  topOverscrollBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 500,
    backgroundColor: "#0A3622",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 80,
    backgroundColor: "#F3F4F6",
  },
  heroSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  heroBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 12,
  },
  belowHeroContent: {
    paddingHorizontal: 16,
  },
  belowHeroContentDark: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  lightSection: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  calculatorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  nameBlock: {
    marginTop: 12,
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  heroBrandText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(74,222,128,0.9)",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroNameText: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 28,
  },
  heroNameInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 28,
    padding: 0,
    margin: 0,
    minHeight: 28,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.4)",
    paddingBottom: 4,
  },
  suggestedPriceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 8,
  },
  suggestedPriceLabelUpper: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4ADE80",
    letterSpacing: 1,
    marginBottom: 4,
  },
  suggestedPriceBig: {
    fontSize: 48,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 52,
  },
  suggestedPriceSubNote: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  activeListingsBox: {
    alignItems: "center",
  },
  activeListingsLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.5,
  },
  activeListingsCount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 32,
  },
  heroFadeBottom: {
    height: 12,
  },
  productCard: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 16,
    gap: 12,
    overflow: "hidden" as const,
  },
  scannedImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  scannedImageLarge: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  productDetails: {
    flex: 1,
    justifyContent: "center",
  },
  productName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 14,
    marginBottom: 8,
  },
  categoryBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "500",
  },
  productDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  suggestedPrice: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 0,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  suggestedPriceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  suggestedPriceTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  suggestedPriceLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  suggestedPriceNote: {
    fontSize: 12,
  },
  suggestedPriceValue: {
    fontSize: 32,
    fontWeight: "700",
  },
  listOnEbayButtonInCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  filterTabs: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterTabActive: {
    borderWidth: 0,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  filterTabTextActive: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  listOnEbayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  listOnEbayText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  calculatorCardFull: {
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  calculatorSection: {
    marginTop: 20,
  },
  calcDividerLine: {
    height: 1,
    marginBottom: 20,
  },
  calcHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  calculatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  calculatorTitleText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  marginBadge: {
    borderWidth: 1.5,
    borderColor: "#047857",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  marginBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#047857",
  },
  calcDividerThin: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 14,
  },
  calculatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  calcLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  labelWithHint: {
    flexDirection: "column",
    gap: 4,
  },
  suggestedHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
  },
  calcSuggestedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  calcInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 110,
  },
  calcInputDollar: {
    fontSize: 20,
    fontWeight: "600",
    color: "#9CA3AF",
    marginRight: 6,
  },
  calcInputValue: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    minWidth: 55,
    textAlign: "right",
  },
  feesPill: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  feesPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  calcFeesValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F59E0B",
  },
  calculatorTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  calculatorLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  suggestedHintText: {
    fontSize: 16,
    fontWeight: "700",
  },
  calculatorValue: {
    fontSize: 16,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 100,
  },
  dollarSign: {
    fontSize: 16,
    fontWeight: "500",
    marginRight: 4,
  },
  priceInput: {
    fontSize: 16,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right",
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  profitLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  profitValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  calculatorNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  listingTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  listingTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  listingTabActive: {
    borderWidth: 1,
  },
  listingTabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  listingCard: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    marginHorizontal: 16,
  },
  listingImage: {
    width: 100,
    height: 140,
  },
  imagePlaceholder: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: 8,
    gap: 6,
  },
  imagePlaceholderText: {
    fontSize: 11,
    fontWeight: "500" as const,
  },
  listingContent: {
    flex: 1,
    padding: 12,
  },
  ebayBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  ebayBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  listingTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  currentPrice: {
    fontSize: 18,
    fontWeight: "700",
  },
  originalPrice: {
    fontSize: 14,
    textDecorationLine: "line-through",
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: "500",
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
  },
  newSearchButton: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  newSearchText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  sortContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  sortContent: {
    gap: 8,
    paddingRight: 4,
  },
  sortContainerFull: {
    marginTop: 12,
    marginBottom: 8,
    marginHorizontal: -16,
  },
  sortContentFull: {
    gap: 8,
    paddingHorizontal: 16,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  buyScoreCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  buyScoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  buyScoreTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
  },
  buyScoreSectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 1,
    marginBottom: 4,
  },
  buyScoreHint: {
    fontSize: 12,
    maxWidth: 200,
  },
  buyScoreNumberContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  buyScoreValue: {
    fontSize: 36,
    fontWeight: "800",
  },
  buyScoreOutOf: {
    fontSize: 14,
    fontWeight: "600",
  },
  meterContainer: {
    position: "relative" as const,
    height: 24,
    justifyContent: "center" as const,
    marginBottom: 6,
  },
  meterTrack: {
    height: 14,
    borderRadius: 7,
    flexDirection: "row",
    overflow: "hidden",
  },
  meterSegment: {
    flex: 1,
    height: "100%" as any,
  },
  meterRed: {
    backgroundColor: "#EF4444",
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  meterYellow: {
    backgroundColor: "#F59E0B",
  },
  meterGreen: {
    backgroundColor: "#22C55E",
  },
  meterIndicator: {
    position: "absolute" as const,
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    marginLeft: -10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  meterLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  meterLabelText: {
    fontSize: 10,
    fontWeight: "500",
  },
  buyScoreLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buyScoreLabelText: {
    fontSize: 16,
    fontWeight: "700",
  },
  advancedSearchContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(212,169,38,0.4)",
    padding: 12,
    marginBottom: 16,
  },
  advancedSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#047857",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  advancedSearchLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  salesIntelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
    paddingBottom: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 12,
  },
  salesIntelLeft: {
    flex: 1,
  },
  salesIntelLabel: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  salesIntelTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
  },
  salesIntelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  salesIntelBadgeText: {
    color: "#3D2E00",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  broadDisclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  broadDisclaimerText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  advancedSectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 12,
  },
  ebaySoldButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3665F3",
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  ebaySoldButtonPro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14532D",
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(212, 169, 38, 0.3)",
  },
  ebaySoldButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  ebaySoldButtonTextPro: {
    color: "#F0D264",
    fontSize: 17,
    fontWeight: "700",
  },
  ebaySoldIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(212, 169, 38, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  ebaySoldTextGroup: {
    flex: 1,
    gap: 2,
  },
  ebaySoldButtonTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  ebaySoldButtonSubtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontWeight: "500",
  },
  ebaySoldProBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  ebaySoldProBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#3D2E00",
    letterSpacing: 0.5,
  },
  ebaySoldErrorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  noResultsEmptyState: {
    alignItems: "center",
    paddingVertical: 8,
  },
  noResultsIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(4, 120, 87, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  noResultsTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  noResultsDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  ebaySoldSummary: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  ebaySoldSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingBottom: 8,
  },
  ebaySoldSummaryHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ebaySoldSummaryTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  ebaySoldMatchCount: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  ebaySoldSummarySubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  broadSearchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#047857",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 4,
  },
  broadSearchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  ebaySoldStatsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  ebaySoldStat: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  ebaySoldStatDivider: {
    width: 1,
    height: 44,
    marginTop: 4,
  },
  ebaySoldStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  ebaySoldStatValue: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 3,
  },
  ebaySoldStatSub: {
    fontSize: 11,
    fontWeight: "400",
  },
  avgPerMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingTop: 16,
  },
  avgPerMonthLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  avgPerMonthValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  avgPerMonthUnit: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: -4,
  },
  ebaySoldCondition: {
    fontSize: 12,
    fontWeight: "500",
  },
  ebaySoldDate: {
    fontSize: 11,
    marginTop: 2,
  },
  salesIntelCardWrapper: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#047857",
  },
  salesIntelCard: {
    padding: 16,
  },
  salesIntelCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  salesIntelCardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  salesIntelCardProPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  salesIntelCardProPillText: {
    color: "#3D2E00",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  blurredMetricsContainer: {
    marginBottom: 14,
  },
  blurredMetricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  blurredMetricBox: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  blurredMetricLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  redactedBar: {
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  redactedBlock: {
    height: 14,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
  },
  salesIntelCtaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingVertical: 10,
  },
  salesIntelCtaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#047857",
  },
});
