import React, { useState, useMemo, useCallback } from "react";
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
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type SearchResultsRouteProp = RouteProp<RootStackParamList, "SearchResults">;

interface ListingItem {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number;
  condition: string;
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

  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [sortOption, setSortOption] = useState<string>("Best Match");

  interface EbaySoldItem {
    title: string;
    price: number;
    soldDate: string;
    url: string;
    imageUrl: string;
  }
  interface EbaySoldData {
    soldCount: number;
    avgSoldPrice: number;
    recentSales: EbaySoldItem[];
  }
  const [ebaySoldData, setEbaySoldData] = useState<EbaySoldData | null>(null);
  const [ebaySoldLoading, setEbaySoldLoading] = useState(false);
  const [ebaySoldError, setEbaySoldError] = useState(false);

  const fetchEbaySold = useCallback(async () => {
    let productName = results.productInfo?.name || results.query;
    if (productName === "Scanned Product" && results.listings?.length > 0) {
      productName = results.listings[0].title;
    }
    if (!productName) return;
    setEbaySoldLoading(true);
    setEbaySoldError(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const url = new URL("/api/ebay-sold", getApiUrl());
      const resp = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: productName }),
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      setEbaySoldData(data);
    } catch {
      setEbaySoldError(true);
    } finally {
      setEbaySoldLoading(false);
    }
  }, [results]);
  
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
    const sorted = [...allListings];
    switch (sortOption) {
      case "Price: Low to High":
        return sorted.sort((a, b) => a.currentPrice - b.currentPrice);
      case "Price: High to Low":
        return sorted.sort((a, b) => b.currentPrice - a.currentPrice);
      default:
        return [...allListings];
    }
  }, [allListings, sortOption]);

  const handleNewSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.goBack();
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
          <Text style={[styles.currentPrice, { color: theme.colors.foreground }]}>
            ${item.currentPrice.toFixed(2)}
          </Text>
          {item.originalPrice ? (
            <Text style={[styles.originalPrice, { color: theme.colors.mutedForeground }]}>
              ${item.originalPrice.toFixed(2)}
            </Text>
          ) : null}
          <Text style={[styles.condition, { color: theme.colors.mutedForeground }]}>
            {item.condition}
          </Text>
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

            {/* Demand Indicator */}
            <View style={[styles.demandCard, { backgroundColor: theme.colors.card }]}>
              <View style={styles.demandHeader}>
                <Feather name="activity" size={18} color={theme.colors.primary} />
                <Text style={[styles.demandTitle, { color: theme.colors.foreground }]}>
                  Market Demand
                </Text>
              </View>
              
              <View style={styles.demandContent}>
                {(() => {
                  const isLens = results.usedLens;
                  const highThreshold = isLens ? 15 : 50;
                  const medThreshold = isLens ? 5 : 20;
                  const maxForBar = isLens ? 30 : 100;
                  const isHigh = results.totalListings >= highThreshold;
                  const isMed = results.totalListings >= medThreshold;
                  
                  return (
                    <>
                      <View style={styles.demandBarContainer}>
                        <View style={[styles.demandBarBg, { backgroundColor: theme.colors.muted }]}>
                          <View 
                            style={[
                              styles.demandBarFill, 
                              { 
                                backgroundColor: isHigh
                                  ? theme.colors.primary 
                                  : isMed
                                    ? theme.colors.warning 
                                    : theme.colors.danger,
                                width: `${Math.min(100, (results.totalListings / maxForBar) * 100)}%`
                              }
                            ]} 
                          />
                        </View>
                        <View style={styles.demandLabels}>
                          <Text style={[styles.demandLabelText, { color: theme.colors.mutedForeground }]}>Low</Text>
                          <Text style={[styles.demandLabelText, { color: theme.colors.mutedForeground }]}>Medium</Text>
                          <Text style={[styles.demandLabelText, { color: theme.colors.mutedForeground }]}>High</Text>
                        </View>
                      </View>
                      
                      <View style={styles.demandStats}>
                        <View style={[
                          styles.demandBadge, 
                          { 
                            backgroundColor: isHigh
                              ? theme.colors.primary + '20'
                              : isMed
                                ? theme.colors.warning + '20'
                                : theme.colors.danger + '20'
                          }
                        ]}>
                          <Text style={[
                            styles.demandBadgeText, 
                            { 
                              color: isHigh
                                ? theme.colors.primary 
                                : isMed
                                  ? theme.colors.warning 
                                  : theme.colors.danger
                            }
                          ]}>
                            {isHigh ? 'High Demand' : isMed ? 'Medium Demand' : 'Low Demand'}
                          </Text>
                        </View>
                        <Text style={[styles.listingCount, { color: theme.colors.foreground }]}>
                          {results.totalListings} active listings
                        </Text>
                      </View>

                      <Text style={[styles.demandHint, { color: theme.colors.mutedForeground }]}>
                        {isHigh
                          ? 'Popular item with competitive market. Price competitively!'
                          : isMed
                            ? 'Moderate competition. Good opportunity for sellers.'
                            : 'Limited competition. Consider pricing higher!'}
                      </Text>
                    </>
                  );
                })()}

                {ebaySoldData ? (
                  <View style={styles.soldSection}>
                    <View style={[styles.soldDivider, { backgroundColor: theme.colors.border }]} />
                    <View style={styles.soldHeader}>
                      <Feather name="trending-up" size={16} color="#3665F3" />
                      <Text style={[styles.soldHeaderTitle, { color: theme.colors.foreground }]}>
                        eBay Sold History
                      </Text>
                    </View>
                    <View style={styles.soldStatsRow}>
                      <View style={[styles.soldStatBox, { backgroundColor: theme.colors.muted }]}>
                        <Text style={[styles.soldStatValue, { color: theme.colors.foreground }]}>
                          {ebaySoldData.soldCount}
                        </Text>
                        <Text style={[styles.soldStatLabel, { color: theme.colors.mutedForeground }]}>
                          Recent Sales
                        </Text>
                      </View>
                      <View style={[styles.soldStatBox, { backgroundColor: theme.colors.muted }]}>
                        <Text style={[styles.soldStatValue, { color: theme.colors.primary }]}>
                          ${ebaySoldData.avgSoldPrice.toFixed(0)}
                        </Text>
                        <Text style={[styles.soldStatLabel, { color: theme.colors.mutedForeground }]}>
                          Avg Sold Price
                        </Text>
                      </View>
                    </View>
                    {ebaySoldData.recentSales.length > 0 ? (
                      <View style={styles.soldList}>
                        {ebaySoldData.recentSales.slice(0, 5).map((sale, idx) => (
                          <Pressable
                            key={idx}
                            style={[styles.soldItem, { backgroundColor: theme.colors.muted }]}
                            onPress={() => {
                              if (sale.url) {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                Linking.openURL(sale.url);
                              }
                            }}
                            testID={`sold-item-${idx}`}
                          >
                            {sale.imageUrl ? (
                              <Image
                                source={{ uri: sale.imageUrl }}
                                style={styles.soldItemImage}
                                contentFit="cover"
                              />
                            ) : (
                              <View style={[styles.soldItemImage, { backgroundColor: theme.colors.border, alignItems: "center", justifyContent: "center" }]}>
                                <Feather name="package" size={16} color={theme.colors.mutedForeground} />
                              </View>
                            )}
                            <View style={styles.soldItemContent}>
                              <Text style={[styles.soldItemTitle, { color: theme.colors.foreground }]} numberOfLines={2}>
                                {sale.title}
                              </Text>
                              <View style={styles.soldItemBottom}>
                                <Text style={[styles.soldItemPrice, { color: theme.colors.primary }]}>
                                  ${sale.price.toFixed(2)}
                                </Text>
                                {sale.soldDate ? (
                                  <Text style={[styles.soldItemDate, { color: theme.colors.mutedForeground }]}>
                                    {sale.soldDate}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                            {sale.url ? (
                              <Feather name="external-link" size={14} color={theme.colors.mutedForeground} style={{ alignSelf: "center" }} />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <Pressable
                      onPress={fetchEbaySold}
                      style={[styles.refreshSoldButton, { borderColor: theme.colors.border }]}
                      testID="button-refresh-sold"
                    >
                      <Feather name="refresh-cw" size={14} color={theme.colors.mutedForeground} />
                      <Text style={[styles.refreshSoldText, { color: theme.colors.mutedForeground }]}>
                        Refresh
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={fetchEbaySold}
                    disabled={ebaySoldLoading}
                    style={[styles.checkSalesButton, { backgroundColor: "#3665F3" }]}
                    testID="button-check-sales"
                  >
                    {ebaySoldLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Feather name="trending-up" size={16} color="#FFFFFF" />
                        <Text style={styles.checkSalesText}>
                          {ebaySoldError ? "Retry Check Sales" : "Check Recent Sales"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                )}
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
  demandCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  demandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  demandTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  demandContent: {
    gap: 16,
  },
  demandBarContainer: {
    gap: 8,
  },
  demandBarBg: {
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
  },
  demandBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  demandLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  demandLabelText: {
    fontSize: 11,
    fontWeight: "500",
  },
  demandStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  demandBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  demandBadgeText: {
    fontSize: 14,
    fontWeight: "700",
  },
  listingCount: {
    fontSize: 15,
    fontWeight: "600",
  },
  demandHint: {
    fontSize: 13,
    lineHeight: 18,
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
  condition: {
    fontSize: 12,
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
  checkSalesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  checkSalesText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  soldSection: {
    marginTop: 4,
  },
  soldDivider: {
    height: 1,
    marginVertical: 16,
  },
  soldHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  soldHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  soldStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  soldStatBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  soldStatValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  soldStatLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  soldList: {
    gap: 8,
  },
  soldItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    overflow: "hidden",
    gap: 10,
    paddingRight: 12,
  },
  soldItemImage: {
    width: 52,
    height: 52,
    borderRadius: 8,
  },
  soldItemContent: {
    flex: 1,
    paddingVertical: 8,
  },
  soldItemTitle: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 16,
  },
  soldItemBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  soldItemPrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  soldItemDate: {
    fontSize: 12,
  },
  refreshSoldButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  refreshSoldText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
