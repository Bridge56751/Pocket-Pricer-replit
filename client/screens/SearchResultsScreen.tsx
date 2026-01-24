import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Text, Linking } from "react-native";
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
}

export default function SearchResultsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, colors } = useDesignTokens();
  const route = useRoute<SearchResultsRouteProp>();
  const navigation = useNavigation();

  const { results } = route.params;
  const [activeTab, setActiveTab] = useState<"all" | "active" | "sold">("all");

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

  const filteredListings = activeTab === "sold" 
    ? [] 
    : results.listings;

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
        data={filteredListings}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={styles.filterTabs}>
              <Pressable
                style={[
                  styles.filterTab,
                  styles.filterTabActive,
                  { backgroundColor: theme.colors.primary }
                ]}
              >
                <Text style={styles.filterTabTextActive}>
                  All ({results.totalListings})
                </Text>
              </Pressable>
              <Pressable style={[styles.filterTab, { borderColor: theme.colors.border }]}>
                <Text style={[styles.filterTabText, { color: theme.colors.foreground }]}>
                  eBay ({results.totalListings})
                </Text>
              </Pressable>
              <Pressable style={[styles.filterTab, { borderColor: theme.colors.border }]}>
                <Text style={[styles.filterTabText, { color: theme.colors.foreground }]}>
                  Mercari (0)
                </Text>
              </Pressable>
              <Pressable style={[styles.filterTab, { borderColor: theme.colors.border }]}>
                <Text style={[styles.filterTabText, { color: theme.colors.foreground }]}>
                  Poshmark (0)
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.listOnEbayButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="external-link" size={16} color={colors.light.primaryForeground} />
              <Text style={styles.listOnEbayText}>List on eBay</Text>
            </Pressable>

            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: theme.colors.card }]}>
                <View style={styles.statHeader}>
                  <Feather name="tag" size={14} color={theme.colors.mutedForeground} />
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    Avg. List Price
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  ${results.avgListPrice.toFixed(0)}
                </Text>
                <Text style={[styles.statSubtext, { color: theme.colors.mutedForeground }]}>
                  {results.totalListings} active listings
                </Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.card }]}>
                <View style={styles.statHeader}>
                  <Feather name="dollar-sign" size={14} color={theme.colors.mutedForeground} />
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    Avg. Sale Price
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  {results.avgSalePrice ? `$${results.avgSalePrice.toFixed(0)}` : "N/A"}
                </Text>
                <Text style={[styles.statSubtext, { color: theme.colors.mutedForeground }]}>
                  {results.soldCount} sold items
                </Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.card }]}>
                <View style={styles.statHeader}>
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    Best Buy Now
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  ${results.bestBuyNow.toFixed(0)}
                </Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: theme.colors.card }]}>
                <View style={styles.statHeader}>
                  <Text style={[styles.statLabel, { color: theme.colors.mutedForeground }]}>
                    Top Sale Price
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: theme.colors.foreground }]}>
                  {results.topSalePrice ? `$${results.topSalePrice.toFixed(0)}` : "N/A"}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Marketplace Listings
            </Text>

            <View style={styles.listingTabs}>
              <Pressable
                onPress={() => setActiveTab("all")}
                style={[
                  styles.listingTab,
                  activeTab === "all" && styles.listingTabActive,
                  { borderColor: activeTab === "all" ? theme.colors.primary : theme.colors.border }
                ]}
              >
                <Feather 
                  name="check-square" 
                  size={14} 
                  color={activeTab === "all" ? theme.colors.primary : theme.colors.mutedForeground} 
                />
                <Text style={[
                  styles.listingTabText,
                  { color: activeTab === "all" ? theme.colors.primary : theme.colors.foreground }
                ]}>
                  All ({results.totalListings})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab("active")}
                style={[
                  styles.listingTab,
                  activeTab === "active" && styles.listingTabActive,
                  { borderColor: activeTab === "active" ? theme.colors.primary : theme.colors.border }
                ]}
              >
                <Feather 
                  name="tag" 
                  size={14} 
                  color={activeTab === "active" ? theme.colors.primary : theme.colors.mutedForeground} 
                />
                <Text style={[
                  styles.listingTabText,
                  { color: activeTab === "active" ? theme.colors.primary : theme.colors.foreground }
                ]}>
                  Active ({results.totalListings})
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab("sold")}
                style={[
                  styles.listingTab,
                  activeTab === "sold" && styles.listingTabActive,
                  { borderColor: activeTab === "sold" ? theme.colors.primary : theme.colors.border }
                ]}
              >
                <Text style={[
                  styles.listingTabText,
                  { color: activeTab === "sold" ? theme.colors.primary : theme.colors.foreground }
                ]}>
                  Sold (0)
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={renderListing}
        ListEmptyComponent={
          activeTab === "sold" ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.colors.mutedForeground }]}>
                No sold listings found
              </Text>
            </View>
          ) : null
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: "47%",
    padding: 16,
    borderRadius: 12,
  },
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  statSubtext: {
    fontSize: 12,
    marginTop: 4,
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
