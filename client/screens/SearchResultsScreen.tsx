import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Text, Linking, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { SkeletonLoader } from "@/components/SkeletonLoader";
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
  scannedImageUri?: string;
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

  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState(results.avgListPrice.toFixed(2));
  
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

  const handleNewSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.goBack();
  };

  const handleListOnEbay = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const searchQuery = encodeURIComponent(results.productInfo?.name || results.query);
    await Linking.openURL(`https://www.ebay.com/sl/sell?keyword=${searchQuery}`);
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
        <View style={[styles.ebayBadge, { backgroundColor: "#3665F3" }]}>
          <Text style={styles.ebayBadgeText}>eBay</Text>
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
        {item.shipping > 0 ? (
          <View style={styles.shippingRow}>
            <Feather name="truck" size={12} color={theme.colors.mutedForeground} />
            <Text style={[styles.shippingText, { color: theme.colors.mutedForeground }]}>
              +${item.shipping.toFixed(2)} delivery
            </Text>
          </View>
        ) : (
          <View style={styles.shippingRow}>
            <Feather name="truck" size={12} color={theme.colors.primary} />
            <Text style={[styles.shippingText, { color: theme.colors.primary }]}>
              Free shipping
            </Text>
          </View>
        )}
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
        data={results.listings}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {results.scannedImageUri ? (
              <View style={[styles.productCard, { backgroundColor: theme.colors.card }]}>
                <Image
                  source={{ uri: results.scannedImageUri }}
                  style={styles.scannedImage}
                  contentFit="cover"
                />
                <View style={styles.productDetails}>
                  <Text style={[styles.productName, { color: theme.colors.foreground }]}>
                    {results.productInfo?.name || results.query}
                  </Text>
                  {results.productInfo?.brand ? (
                    <Text style={[styles.productBrand, { color: theme.colors.mutedForeground }]}>
                      {results.productInfo.brand}
                    </Text>
                  ) : null}
                  {results.productInfo?.category ? (
                    <View style={[styles.categoryBadge, { backgroundColor: theme.colors.muted }]}>
                      <Text style={[styles.categoryText, { color: theme.colors.foreground }]}>
                        {results.productInfo.category}
                      </Text>
                    </View>
                  ) : null}
                  {results.productInfo?.description ? (
                    <Text 
                      style={[styles.productDescription, { color: theme.colors.mutedForeground }]}
                      numberOfLines={2}
                    >
                      {results.productInfo.description}
                    </Text>
                  ) : null}
                </View>
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
                <View style={styles.demandBarContainer}>
                  <View style={[styles.demandBarBg, { backgroundColor: theme.colors.muted }]}>
                    <View 
                      style={[
                        styles.demandBarFill, 
                        { 
                          backgroundColor: results.totalListings >= 50 
                            ? theme.colors.primary 
                            : results.totalListings >= 20 
                              ? theme.colors.warning 
                              : theme.colors.danger,
                          width: `${Math.min(100, (results.totalListings / 100) * 100)}%`
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
                      backgroundColor: results.totalListings >= 50 
                        ? theme.colors.primary + '20'
                        : results.totalListings >= 20 
                          ? theme.colors.warning + '20'
                          : theme.colors.danger + '20'
                    }
                  ]}>
                    <Text style={[
                      styles.demandBadgeText, 
                      { 
                        color: results.totalListings >= 50 
                          ? theme.colors.primary 
                          : results.totalListings >= 20 
                            ? theme.colors.warning 
                            : theme.colors.danger
                      }
                    ]}>
                      {results.totalListings >= 50 ? 'High Demand' : results.totalListings >= 20 ? 'Medium Demand' : 'Low Demand'}
                    </Text>
                  </View>
                  <Text style={[styles.listingCount, { color: theme.colors.foreground }]}>
                    {results.totalListings} active listings
                  </Text>
                </View>

                <Text style={[styles.demandHint, { color: theme.colors.mutedForeground }]}>
                  {results.totalListings >= 50 
                    ? 'Popular item with competitive market. Price competitively!'
                    : results.totalListings >= 20 
                      ? 'Moderate competition. Good opportunity for sellers.'
                      : 'Limited competition. Consider pricing higher!'}
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
                  />
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

              <View style={styles.calculatorRow}>
                <Text style={[styles.calculatorLabel, { color: theme.colors.mutedForeground }]}>
                  eBay Fees (~13%)
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

              <Pressable
                onPress={handleListOnEbay}
                style={({ pressed }) => [
                  styles.listOnEbayButton,
                  { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="external-link" size={16} color={colors.light.primaryForeground} />
                <Text style={styles.listOnEbayText}>List This Item on eBay</Text>
              </Pressable>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Active Listings ({results.totalListings})
            </Text>
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
    paddingVertical: 2,
  },
  suggestedHintText: {
    fontSize: 12,
    fontWeight: "600",
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
  shippingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },
  shippingText: {
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
});
