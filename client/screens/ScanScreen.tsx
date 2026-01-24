import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Platform, Text, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { ProfitBadge } from "@/components/ProfitBadge";
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import type { Product, SearchHistoryItem } from "@/types/product";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Image } from "expo-image";

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
    } finally {
      setIsSearching(false);
      setSearchQuery("");
    }
  }, [searchQuery, navigation]);

  const handleScanPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    navigation.navigate("BarcodeScanner");
  };

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
                placeholder="Search eBay products..."
                placeholderTextColor={theme.colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="search-input"
              />
              {Platform.OS !== "web" ? (
                <Pressable
                  onPress={handleScanPress}
                  style={({ pressed }) => [
                    theme.components.button.icon,
                    { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
                  ]}
                  testID="scan-button"
                >
                  <Feather name="camera" size={18} color={colors.light.primaryForeground} />
                </Pressable>
              ) : null}
            </View>
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
              title="Start Searching"
              message="Search for any product to see its estimated selling price and potential profit on eBay"
            />
          ) : null
        }
        renderItem={renderRecentItem}
      />

      {Platform.OS !== "web" ? (
        <Pressable
          style={({ pressed }) => [
            theme.components.button.fab,
            { position: "absolute", right: theme.spacing.lg, bottom: tabBarHeight + theme.spacing.xl, opacity: pressed ? 0.7 : 1 }
          ]}
          onPress={handleScanPress}
          testID="fab-scan"
        >
          <Feather name="camera" size={24} color={colors.light.primaryForeground} />
        </Pressable>
      ) : null}
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
  searchingContainer: {
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
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
