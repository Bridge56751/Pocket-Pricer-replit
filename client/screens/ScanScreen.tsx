import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Image } from "expo-image";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { ProfitBadge } from "@/components/ProfitBadge";
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import type { Product, SearchHistoryItem } from "@/types/product";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRecentSearches();
  }, []);

  const loadRecentSearches = async () => {
    setIsLoading(true);
    try {
      const history = await getSearchHistory();
      setRecentSearches(history.slice(0, 10));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await apiRequest("POST", "/api/search", { query: searchQuery });
      const product: Product = await response.json();

      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: searchQuery,
        product,
        searchedAt: new Date().toISOString(),
      };

      await addSearchHistory(historyItem);
      setRecentSearches(prev => [historyItem, ...prev.slice(0, 9)]);

      navigation.navigate("ProductDetail", { product });
    } catch (error) {
      console.error("Search failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSearching(false);
      setSearchQuery("");
    }
  }, [searchQuery, navigation]);

  const handleProductPress = (product: Product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const renderRecentItem = ({ item, index }: { item: SearchHistoryItem; index: number }) => {
    if (!item.product) return null;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)} style={styles.gridItem}>
        <Pressable
          onPress={() => handleProductPress(item.product!)}
          style={({ pressed }) => [
            styles.productCard,
            { backgroundColor: theme.colors.card, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Image
            source={{ uri: item.product.imageUrl }}
            style={styles.productImage}
            contentFit="cover"
          />
          <View style={styles.productBadge}>
            <ProfitBadge profit={item.product.estimatedProfit} size="small" />
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  const recentProducts = recentSearches.filter(s => s.product);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + theme.spacing.xl,
            paddingBottom: tabBarHeight + theme.spacing["5xl"] + theme.spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={recentProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.searchContainer, { backgroundColor: theme.colors.card }]}>
              <Feather name="search" size={20} color={theme.colors.mutedForeground} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: theme.colors.foreground }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                placeholder="Search eBay listings..."
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="search-input"
              />
              <Pressable
                onPress={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                style={({ pressed }) => [
                  styles.searchButton,
                  { 
                    backgroundColor: theme.colors.primary, 
                    opacity: (pressed || isSearching || !searchQuery.trim()) ? 0.5 : 1 
                  }
                ]}
                testID="search-button"
              >
                <Feather 
                  name={isSearching ? "loader" : "arrow-right"} 
                  size={18} 
                  color={colors.light.primaryForeground} 
                />
              </Pressable>
            </View>
            
            <Text style={[styles.helperText, { color: theme.colors.mutedForeground }]}>
              Search for any product to see real eBay listings and profit estimates
            </Text>

            {isSearching ? (
              <View style={styles.searchingContainer}>
                <SkeletonLoader count={2} type="card" />
              </View>
            ) : null}
            
            {recentProducts.length > 0 && !isSearching ? (
              <View style={styles.sectionHeader}>
                <Feather name="clock" size={16} color={theme.colors.mutedForeground} />
                <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                  Recent Searches
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !isLoading && !isSearching ? (
            <EmptyState
              image={require("../../assets/images/empty-search.png")}
              title="Search eBay Listings"
              message="Enter a product name to find current active listings and see how much profit you can make"
            />
          ) : null
        }
        renderItem={renderRecentItem}
      />
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
    flexGrow: 1,
  },
  header: {
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 4,
    height: 52,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  searchingContainer: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  columnWrapper: {
    justifyContent: "space-between",
  },
  gridItem: {
    width: "48%",
  },
  productCard: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  productBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
  },
});
