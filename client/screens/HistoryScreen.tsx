import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getSearchHistory, clearSearchHistory } from "@/lib/storage";
import type { SearchHistoryItem, Product } from "@/types/product";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await getSearchHistory();
      setHistory(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await clearSearchHistory();
    setHistory([]);
  };

  const handleProductPress = (product: Product) => {
    navigation.navigate("ProductDetail", { product });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderItem = ({ item, index }: { item: SearchHistoryItem; index: number }) => {
    if (!item.product) {
      return (
        <Animated.View
          entering={FadeInDown.delay(index * 50).duration(300)}
          style={[styles.queryItem, { backgroundColor: theme.backgroundDefault }]}
        >
          <Feather name="search" size={20} color={theme.textSecondary} />
          <View style={styles.queryContent}>
            <ThemedText style={styles.queryText}>{item.query}</ThemedText>
            <ThemedText style={[styles.timestamp, { color: theme.textSecondary }]}>
              {formatDate(item.searchedAt)} - No results
            </ThemedText>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <View style={styles.itemContainer}>
          <ProductCard product={item.product} onPress={() => handleProductPress(item.product!)} />
          <ThemedText style={[styles.timestamp, { color: theme.textSecondary }]}>
            {formatDate(item.searchedAt)}
          </ThemedText>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
          history.length === 0 && !isLoading && styles.emptyContent,
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={history}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          history.length > 0 ? (
            <Pressable
              onPress={handleClearHistory}
              style={({ pressed }) => [
                styles.clearButton,
                { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash-2" size={16} color={theme.danger} />
              <ThemedText style={[styles.clearText, { color: theme.danger }]}>
                Clear History
              </ThemedText>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonLoader count={5} type="card" />
          ) : (
            <EmptyState
              image={require("../../assets/images/empty-history.png")}
              title="No Search History"
              message="Your recent product searches will appear here. Start searching to build your history."
            />
          )
        }
        renderItem={renderItem}
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
    paddingHorizontal: Spacing.lg,
  },
  emptyContent: {
    flexGrow: 1,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.lg,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: Spacing.xs,
  },
  itemContainer: {
    marginBottom: Spacing.xs,
  },
  queryItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  queryContent: {
    marginLeft: Spacing.md,
    flex: 1,
  },
  queryText: {
    fontWeight: "500",
  },
  timestamp: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
});
