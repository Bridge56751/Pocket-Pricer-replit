import React, { useState, useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable, Text, Linking, TextInput, ActivityIndicator, ScrollView, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getImage } from "@/lib/image-store";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { EbaySoldData, EbaySoldItem } from "@/types/product";

type SearchResultsRouteProp = RouteProp<RootStackParamList, "SearchResults">;

interface ListingItem {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number;
  condition?: string;
  shipping: number;
  link: string;
  seller?: string;
  platform?: string;
  rating?: number;
  reviews?: number;
}

interface SearchResultsData {
  query: string;
  totalListings: number;
  avgListPrice: number;
  avgSalePrice: number | null;
  soldCount: number;
  bestBuyNow: number;
  topSalePrice: number | null;
  listings: ListingItem[];
  scannedImageId?: string;
  scannedImageUri?: string;
  usedLens?: boolean;
  productInfo?: {
    name: string;
    brand?: string;
    category?: string;
    description?: string;
  };
}

export default function SearchResultsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, colors } = useDesignTokens();
  const route = useRoute<SearchResultsRouteProp>();
  const navigation = useNavigation();

  const { results } = route.params;
  
  const scannedImageUri = useMemo(() => {
    if (results.scannedImageId) {
      return getImage(results.scannedImageId);
    }
    const resultsAny = results as SearchResultsData;
    return resultsAny.scannedImageUri;
  }, [results.scannedImageId, results]);

  const { getDeviceId } = useAuth();
  const { isPro } = useRevenueCat();
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [sortOption, setSortOption] = useState<string>("Best Match");
  const [ebaySoldData, setEbaySoldData] = useState<EbaySoldData | null>(null);
  const [ebaySoldLoading, setEbaySoldLoading] = useState(false);
  const [ebaySoldError, setEbaySoldError] = useState<string | null>(null);
  const [showEbaySold, setShowEbaySold] = useState(false);

  const suggestedPrice = results.avgListPrice;
  const EBAY_FEE_RATE = 0.13;
  
  const calculateProfit = () => {
    const purchase = parseFloat(purchasePrice) || 0;
    const selling = parseFloat(sellingPrice) || suggestedPrice;
    const ebayFees = selling * EBAY_FEE_RATE;
    const profit = selling - purchase - ebayFees;
    return { ebayFees, profit, selling };
  };
  
  const { ebayFees, profit, selling } = calculateProfit();

  const buyScore = useMemo(() => {
    if (!ebaySoldData || !showEbaySold) return null;

    const purchase = parseFloat(purchasePrice) || 0;
    const sellPrice = parseFloat(sellingPrice) || ebaySoldData.medianSoldPrice || suggestedPrice;
    const fees = sellPrice * EBAY_FEE_RATE;
    const netProfit = sellPrice - purchase - fees;

    let profitScore = 0;
    let profitPenalty = 0;
    if (purchase > 0) {
      if (netProfit <= -20) {
        profitScore = 0;
        profitPenalty = 1;
      } else if (netProfit <= 0) {
        profitScore = 0;
        profitPenalty = Math.abs(netProfit) / 20;
      } else if (netProfit >= 50) {
        profitScore = 60;
      } else {
        profitScore = (netProfit / 50) * 60;
      }
    } else {
      const margin = sellPrice > 0 ? ((sellPrice - fees) / sellPrice) : 0;
      profitScore = Math.min(margin * 60, 40);
    }

    let demandScore = 0;
    const totalSold = ebaySoldData.totalSold;
    if (totalSold >= 1000) {
      demandScore = 25;
    } else if (totalSold >= 500) {
      demandScore = 20;
    } else if (totalSold >= 100) {
      demandScore = 15;
    } else if (totalSold >= 25) {
      demandScore = 10;
    } else if (totalSold >= 5) {
      demandScore = 5;
    }

    let consistencyScore = 0;
    if (ebaySoldData.medianSoldPrice > 0 && ebaySoldData.avgSoldPrice > 0) {
      const ratio = Math.min(ebaySoldData.medianSoldPrice, ebaySoldData.avgSoldPrice) /
                    Math.max(ebaySoldData.medianSoldPrice, ebaySoldData.avgSoldPrice);
      consistencyScore = ratio * 15;
    }

    const baseScore = profitScore + demandScore + consistencyScore;
    const penalizedScore = baseScore * (1 - profitPenalty);
    const raw = Math.round(penalizedScore);
    return Math.max(0, Math.min(100, raw));
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

  const allListings = results.listings;

  const sortOptions = ["Best Match", "Price: Low to High", "Price: High to Low"];

  const sortedListings = useMemo(() => {
    if (sortOption === "Best Match") return [...allListings];
    const priced = allListings.filter(item => item.currentPrice > 0);
    const noPrice = allListings.filter(item => item.currentPrice <= 0);
    switch (sortOption) {
      case "Price: Low to High":
        return [...priced.sort((a, b) => a.currentPrice - b.currentPrice), ...noPrice];
      case "Price: High to Low":
        return [...priced.sort((a, b) => b.currentPrice - a.currentPrice), ...noPrice];
      default:
        return [...allListings];
    }
  }, [allListings, sortOption]);

  const handleNewSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.goBack();
  };

  const handleEbaySoldSearch = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (ebaySoldData) {
      setShowEbaySold(!showEbaySold);
      return;
    }
    setEbaySoldLoading(true);
    setEbaySoldError(null);
    try {
      const productName = results.productInfo?.name || results.query;
      const deviceId = await getDeviceId();
      const baseUrl = getApiUrl();
      const url = new URL("/api/ebay-sold-search", baseUrl);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Is-Pro": isPro ? "true" : "false",
        },
        body: JSON.stringify({ searchQuery: productName }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Search failed");
      }
      const data: EbaySoldData = await res.json();
      setEbaySoldData(data);
      setShowEbaySold(true);
    } catch (err: any) {
      setEbaySoldError(err.message || "Failed to load sales data");
    } finally {
      setEbaySoldLoading(false);
    }
  };

  const handleListOnEbay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const productName = typeof results.productInfo === 'object' ? results.productInfo?.name : null;
    const queryStr = typeof results.query === 'string' ? results.query : 'product';
    const searchQuery = encodeURIComponent(productName || queryStr);
    await Linking.openURL(`https://www.ebay.com/sl/sell?keyword=${searchQuery}`);
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

  const renderListing = ({ item, index }: { item: ListingItem; index: number }) => (
    <Animated.View 
      entering={FadeInDown.delay(index * 50).duration(300)}
      style={[styles.listingCard, { backgroundColor: theme.colors.card }]}
    >
      <Image
        source={{ uri: item.imageUrl }}
        style={styles.listingImage}
        contentFit="cover"
      />
      <View style={styles.listingContent}>
        <View style={[styles.ebayBadge, { backgroundColor: getPlatformColor(item.platform || item.seller) }]}>
          <Text style={styles.ebayBadgeText}>{getPlatformName(item.platform, item.seller)}</Text>
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
              <Text style={[styles.currentPrice, { color: theme.colors.foreground }]}>
                ${item.currentPrice.toFixed(2)}
              </Text>
              {item.originalPrice ? (
                <Text style={[styles.originalPrice, { color: theme.colors.mutedForeground }]}>
                  ${item.originalPrice.toFixed(2)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.currentPrice, { color: theme.colors.primary }]}>
              Price unlisted
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => handleViewListing(item.link)}
          style={({ pressed }) => [
            styles.viewButton,
            { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Feather name="external-link" size={14} color={theme.colors.foreground} />
          <Text style={[styles.viewButtonText, { color: theme.colors.foreground }]}>
            View Listing
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: headerHeight + theme.spacing.lg, paddingBottom: 100 }
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={sortedListings}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {scannedImageUri ? (
              <View style={[styles.productCard, { backgroundColor: theme.colors.card }]}>
                <Image
                  source={{ uri: scannedImageUri }}
                  style={styles.scannedImageLarge}
                  contentFit="cover"
                />
              </View>
            ) : null}

            <View style={[styles.suggestedPrice, { backgroundColor: theme.colors.card }]}>
              <View style={styles.suggestedPriceHeader}>
                <View>
                  <View style={styles.suggestedPriceTitle}>
                    <Feather name="star" size={16} color={theme.colors.warning} />
                    <Text style={[styles.suggestedPriceLabel, { color: theme.colors.foreground }]}>
                      Suggested Listing Price
                    </Text>
                  </View>
                  <Text style={[styles.suggestedPriceNote, { color: theme.colors.mutedForeground }]}>
                    Based on current market listings
                  </Text>
                </View>
                <Text style={[styles.suggestedPriceValue, { color: theme.colors.primary }]}>
                  ${results.avgListPrice.toFixed(0)}
                </Text>
              </View>
            </View>

            <View style={[styles.calculatorCard, { backgroundColor: theme.colors.card }]}>
              <View style={styles.calculatorHeader}>
                <Feather name="dollar-sign" size={18} color={theme.colors.primary} />
                <Text style={[styles.calculatorTitle, { color: theme.colors.foreground }]}>
                  Profit Calculator
                </Text>
              </View>

              <View style={styles.calculatorRow}>
                <View style={styles.labelWithHint}>
                  <Text style={[styles.calculatorLabel, { color: theme.colors.mutedForeground }]}>
                    Your Selling Price
                  </Text>
                  <Pressable onPress={useSuggestedPrice} style={styles.suggestedHint}>
                    <Text style={[styles.suggestedHintText, { color: theme.colors.primary }]}>
                      Suggested: ${suggestedPrice.toFixed(0)}
                    </Text>
                  </Pressable>
                </View>
                <View style={[styles.inputContainer, { backgroundColor: theme.colors.muted, borderColor: theme.colors.border }]}>
                  <Text style={[styles.dollarSign, { color: theme.colors.mutedForeground }]}>$</Text>
                  <TextInput
                    style={[styles.priceInput, { color: theme.colors.foreground }]}
                    value={sellingPrice}
                    onChangeText={setSellingPrice}
                    placeholder={suggestedPrice.toFixed(2)}
                    placeholderTextColor={theme.colors.mutedForeground}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
              </View>

              <View style={styles.calculatorRow}>
                <Text style={[styles.calculatorLabel, { color: theme.colors.mutedForeground }]}>
                  Your Purchase Price
                </Text>
                <View style={[styles.inputContainer, { backgroundColor: theme.colors.muted, borderColor: theme.colors.border }]}>
                  <Text style={[styles.dollarSign, { color: theme.colors.mutedForeground }]}>$</Text>
                  <TextInput
                    style={[styles.priceInput, { color: theme.colors.foreground }]}
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                    placeholder="0.00"
                    placeholderTextColor={theme.colors.mutedForeground}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.calculatorRow}>
                <Text style={[styles.calculatorLabel, { color: theme.colors.mutedForeground }]}>
                  Est. Fees (~13%)
                </Text>
                <Text style={[styles.calculatorValue, { color: theme.colors.danger }]}>
                  -${ebayFees.toFixed(2)}
                </Text>
              </View>

              <View style={[styles.profitRow, { backgroundColor: profit > 0 ? theme.colors.primary + '20' : theme.colors.danger + '20' }]}>
                <Text style={[styles.profitLabel, { color: theme.colors.foreground }]}>
                  Estimated Profit
                </Text>
                <Text style={[
                  styles.profitValue, 
                  { color: profit > 0 ? theme.colors.primary : theme.colors.danger }
                ]}>
                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                </Text>
              </View>

              <Text style={[styles.calculatorNote, { color: theme.colors.mutedForeground }]}>
                Based on {results.totalListings} active listings
              </Text>

            </View>

            <Pressable
              testID="button-ebay-sold-search"
              onPress={handleEbaySoldSearch}
              style={({ pressed }) => [
                styles.ebaySoldButton,
                { opacity: pressed ? 0.7 : 1 }
              ]}
            >
              {ebaySoldLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="trending-up" size={18} color="#FFFFFF" />
                  <Text style={styles.ebaySoldButtonText}>
                    {ebaySoldData ? (showEbaySold ? "Hide Sales Data" : "Show Sales Data") : "See eBay Sales Data"}
                  </Text>
                </>
              )}
            </Pressable>

            {ebaySoldError ? (
              <Text style={[styles.ebaySoldErrorText, { color: theme.colors.danger }]}>
                {ebaySoldError}
              </Text>
            ) : null}

            {ebaySoldData && showEbaySold && ebaySoldData.noResults ? (
              <View style={styles.advancedSearchContainer}>
                <View style={styles.advancedSearchHeader}>
                  <Feather name="zap" size={16} color="#FFFFFF" />
                  <Text style={styles.advancedSearchLabel}>Advanced Search</Text>
                </View>
                <View style={[styles.ebaySoldSummary, { backgroundColor: theme.colors.card }]}>
                  <View style={styles.ebaySoldSummaryHeader}>
                    <Feather name="info" size={18} color="#10B981" />
                    <Text style={[styles.ebaySoldSummaryTitle, { color: theme.colors.foreground }]}>
                      No eBay Sales Found
                    </Text>
                  </View>
                  <Text style={[styles.ebaySoldSummarySubtitle, { color: theme.colors.mutedForeground }]}>
                    No recent sold listings were found for this product on eBay. This may mean it's a niche item or hasn't been sold recently.
                  </Text>
                </View>
              </View>
            ) : null}

            {ebaySoldData && showEbaySold && !ebaySoldData.noResults && buyScore !== null ? (
              <View style={styles.advancedSearchContainer}>
                <View style={styles.advancedSearchHeader}>
                  <Feather name="zap" size={16} color="#FFFFFF" />
                  <Text style={styles.advancedSearchLabel}>Advanced Search</Text>
                </View>

                <Animated.View
                  entering={FadeInDown.duration(400)}
                  style={[styles.buyScoreCard, { backgroundColor: theme.colors.card }]}
                >
                  <View style={styles.buyScoreHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.buyScoreTitle, { color: theme.colors.foreground }]}>
                        Buy Score
                      </Text>
                      <Text style={[styles.buyScoreHint, { color: theme.colors.mutedForeground }]}>
                        {parseFloat(purchasePrice) > 0 ? "Based on your cost, demand & market data" : "Enter your purchase price for a precise score"}
                      </Text>
                    </View>
                    <View style={styles.buyScoreNumberContainer}>
                      <Text style={[styles.buyScoreValue, { color: getBuyScoreColor(buyScore) }]}>
                        {buyScore}
                      </Text>
                      <Text style={[styles.buyScoreOutOf, { color: theme.colors.mutedForeground }]}>/100</Text>
                    </View>
                  </View>

                  <View style={styles.meterContainer}>
                    <View style={[styles.meterTrack, { backgroundColor: theme.colors.muted }]}>
                      <View style={[styles.meterSegment, styles.meterRed]} />
                      <View style={[styles.meterSegment, styles.meterYellow]} />
                      <View style={[styles.meterSegment, styles.meterGreen, { borderTopRightRadius: 7, borderBottomRightRadius: 7 }]} />
                    </View>
                    <View
                      style={[
                        styles.meterIndicator,
                        { left: `${Math.max(1, Math.min(98, buyScore))}%`, borderColor: getBuyScoreColor(buyScore) }
                      ]}
                    />
                  </View>

                  <View style={styles.meterLabels}>
                    <Text style={[styles.meterLabelText, { color: theme.colors.mutedForeground }]}>Avoid</Text>
                    <Text style={[styles.meterLabelText, { color: theme.colors.mutedForeground }]}>Risky</Text>
                    <Text style={[styles.meterLabelText, { color: theme.colors.mutedForeground }]}>Fair</Text>
                    <Text style={[styles.meterLabelText, { color: theme.colors.mutedForeground }]}>Good</Text>
                    <Text style={[styles.meterLabelText, { color: theme.colors.mutedForeground }]}>Strong</Text>
                  </View>

                  <View style={[styles.buyScoreLabelRow, { backgroundColor: getBuyScoreColor(buyScore) + '20' }]}>
                    <Feather
                      name={buyScore >= 60 ? "thumbs-up" : buyScore >= 40 ? "minus" : "thumbs-down"}
                      size={16}
                      color={getBuyScoreColor(buyScore)}
                    />
                    <Text style={[styles.buyScoreLabelText, { color: getBuyScoreColor(buyScore) }]}>
                      {getBuyScoreLabel(buyScore)}
                    </Text>
                  </View>
                </Animated.View>

                <View style={[styles.ebaySoldSummary, { backgroundColor: theme.colors.card }]}>
                  <View style={styles.ebaySoldSummaryHeader}>
                    <Feather name="bar-chart-2" size={18} color="#10B981" />
                    <Text style={[styles.ebaySoldSummaryTitle, { color: theme.colors.foreground }]}>
                      eBay Sales Summary
                    </Text>
                  </View>
                  <Text style={[styles.ebaySoldSummarySubtitle, { color: theme.colors.mutedForeground }]}>
                    {(ebaySoldData.totalSold || 0).toLocaleString()} matching sold {ebaySoldData.totalSold === 1 ? "listing" : "listings"} found on eBay
                  </Text>

                  <View style={styles.ebaySoldStatsRow}>
                    <View style={styles.ebaySoldStat}>
                      <Text style={[styles.ebaySoldStatLabel, { color: theme.colors.mutedForeground }]}>
                        Avg Sold
                      </Text>
                      <Text style={[styles.ebaySoldStatValue, { color: theme.colors.foreground }]}>
                        ${(ebaySoldData.avgSoldPrice || 0).toFixed(0)}
                      </Text>
                    </View>
                    <View style={[styles.ebaySoldStatDivider, { backgroundColor: theme.colors.border }]} />
                    <View style={styles.ebaySoldStat}>
                      <Text style={[styles.ebaySoldStatLabel, { color: theme.colors.mutedForeground }]}>
                        Median
                      </Text>
                      <Text style={[styles.ebaySoldStatValue, { color: theme.colors.foreground }]}>
                        ${(ebaySoldData.medianSoldPrice || 0).toFixed(0)}
                      </Text>
                    </View>
                    <View style={[styles.ebaySoldStatDivider, { backgroundColor: theme.colors.border }]} />
                    <View style={styles.ebaySoldStat}>
                      <Text style={[styles.ebaySoldStatLabel, { color: theme.colors.mutedForeground }]}>
                        Range
                      </Text>
                      <Text style={[styles.ebaySoldStatValue, { color: theme.colors.foreground }]}>
                        ${(ebaySoldData.lowPrice || 0).toFixed(0)}-${(ebaySoldData.highPrice || 0).toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.avgPerMonthRow, { backgroundColor: "transparent" }]}>
                    <Feather
                      name="activity"
                      size={16}
                      color={theme.colors.mutedForeground}
                    />
                    <Text style={[styles.avgPerMonthLabel, { color: theme.colors.mutedForeground }]}>
                      Avg Sold/Month
                    </Text>
                    <Text style={[styles.avgPerMonthValue, { color: ebaySoldData.avgSoldPerMonth >= 30 ? "#22C55E" : ebaySoldData.avgSoldPerMonth >= 10 ? "#F59E0B" : theme.colors.foreground }]}>
                      {ebaySoldData.avgSoldPerMonth > 0 ? `~${ebaySoldData.avgSoldPerMonth.toLocaleString()}` : "N/A"}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.advancedSectionTitle, { color: theme.colors.foreground }]}>
                  Recent eBay Sales ({ebaySoldData.items.length})
                </Text>

                {ebaySoldData.items.slice(0, 20).map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInDown.delay(index * 40).duration(250)}
                    style={[styles.listingCard, { backgroundColor: theme.colors.card }]}
                  >
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.listingImage}
                      contentFit="cover"
                    />
                    <View style={styles.listingContent}>
                      <View style={[styles.ebayBadge, { backgroundColor: "#10B981" }]}>
                        <Text style={styles.ebayBadgeText}>SOLD</Text>
                      </View>
                      <Text
                        style={[styles.listingTitle, { color: theme.colors.foreground }]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      <View style={styles.priceRow}>
                        <Text style={[styles.currentPrice, { color: theme.colors.foreground }]}>
                          ${item.price.toFixed(2)}
                        </Text>
                        {item.condition ? (
                          <Text style={[styles.ebaySoldCondition, { color: theme.colors.mutedForeground }]}>
                            {item.condition}
                          </Text>
                        ) : null}
                      </View>
                      {item.soldDate ? (
                        <Text style={[styles.ebaySoldDate, { color: theme.colors.mutedForeground }]}>
                          {item.soldDate.startsWith("Sold") ? item.soldDate : `Sold ${item.soldDate}`}
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => handleViewListing(item.link)}
                        style={({ pressed }) => [
                          styles.viewButton,
                          { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                        ]}
                      >
                        <Feather name="external-link" size={14} color={theme.colors.foreground} />
                        <Text style={[styles.viewButtonText, { color: theme.colors.foreground }]}>
                          View Listing
                        </Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}

                <View style={{ height: 8 }} />
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Active Listings ({allListings.length})
            </Text>

            {allListings.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.sortContainer}
                contentContainerStyle={styles.sortContent}
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
                        backgroundColor: sortOption === option ? theme.colors.primary : theme.colors.muted,
                        borderColor: sortOption === option ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        {
                          color: sortOption === option ? "#FFFFFF" : theme.colors.mutedForeground,
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
        }
        renderItem={renderListing}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: theme.colors.mutedForeground }]}>
              No listings found
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={handleNewSearch}
        style={({ pressed }) => [
          styles.newSearchButton,
          { 
            backgroundColor: theme.colors.primary, 
            bottom: insets.bottom + 16,
            opacity: pressed ? 0.7 : 1 
          }
        ]}
      >
        <Feather name="search" size={18} color={colors.light.primaryForeground} />
        <Text style={styles.newSearchText}>New Search</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  productCard: {
    flexDirection: "row",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    gap: 12,
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
    marginBottom: 16,
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
  calculatorCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  calculatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  calculatorTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  calculatorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  calculatorLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  labelWithHint: {
    flexDirection: "column",
    gap: 4,
  },
  suggestedHint: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
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
  },
  listingImage: {
    width: 100,
    height: 140,
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
    backgroundColor: "transparent",
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: "#10B981",
    padding: 12,
    marginBottom: 16,
  },
  advancedSearchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#10B981",
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
  ebaySoldButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  ebaySoldErrorText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  ebaySoldSummary: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  ebaySoldSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  ebaySoldSummaryTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  ebaySoldSummarySubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },
  ebaySoldStatsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ebaySoldStat: {
    flex: 1,
    alignItems: "center",
  },
  ebaySoldStatDivider: {
    width: 1,
    height: 36,
  },
  ebaySoldStatLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  ebaySoldStatValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  avgPerMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  avgPerMonthLabel: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
  avgPerMonthValue: {
    fontSize: 18,
    fontWeight: "700",
  },
  ebaySoldCondition: {
    fontSize: 12,
    fontWeight: "500",
  },
  ebaySoldDate: {
    fontSize: 11,
    marginTop: 2,
  },
});
