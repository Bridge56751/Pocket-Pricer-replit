import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, FlatList, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";

import { SearchBar } from "@/components/SearchBar";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import type { Product, SearchHistoryItem } from "@/types/product";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fabScale = useSharedValue(1);

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

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

  const handleFabPressIn = () => {
    fabScale.value = withSpring(0.9, { damping: 15, stiffness: 150 });
  };

  const handleFabPressOut = () => {
    fabScale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const renderRecentItem = ({ item, index }: { item: SearchHistoryItem; index: number }) => {
    if (!item.product) return null;

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <ProductCard
          product={item.product}
          compact
          onPress={() => handleProductPress(item.product!)}
        />
      </Animated.View>
    );
  };

  const recentProducts = recentSearches
    .filter(s => s.product)
    .map(s => s);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing["5xl"] + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={recentProducts}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        ListHeaderComponent={
          <View style={styles.header}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmit={handleSearch}
              onScanPress={handleScanPress}
              placeholder="Search eBay products..."
            />
            {isSearching ? (
              <View style={styles.searchingContainer}>
                <SkeletonLoader count={2} type="card" />
              </View>
            ) : null}
            {recentProducts.length > 0 && !isSearching ? (
              <View style={styles.sectionHeader}>
                <Feather name="clock" size={16} color={theme.textSecondary} />
                <View style={{ width: Spacing.sm }} />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }} />
                  <View style={{ flex: 2, alignItems: 'center' }}>
                    <Feather name="clock" size={0} color="transparent" />
                  </View>
                </View>
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
        <AnimatedPressable
          style={[
            styles.fab,
            {
              backgroundColor: theme.primary,
              bottom: tabBarHeight + Spacing.xl,
            },
            fabAnimatedStyle,
          ]}
          onPress={handleScanPress}
          onPressIn={handleFabPressIn}
          onPressOut={handleFabPressOut}
          testID="fab-scan"
        >
          <Feather name="camera" size={24} color="#FFFFFF" />
        </AnimatedPressable>
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
    paddingHorizontal: Spacing.lg,
    flexGrow: 1,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  searchingContainer: {
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  columnWrapper: {
    justifyContent: "space-between",
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
