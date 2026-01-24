import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getSearchHistory, clearSearchHistory } from "@/lib/storage";
import type { SearchHistoryItem } from "@/types/product";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useDesignTokens();

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
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <View style={[styles.historyCard, { backgroundColor: theme.colors.card }]}>
          <View style={styles.historyContent}>
            <View style={styles.queryRow}>
              <Feather name="search" size={16} color={theme.colors.primary} />
              <Text style={[styles.queryText, { color: theme.colors.foreground }]}>
                {item.query}
              </Text>
            </View>
            <Text style={[styles.timestamp, { color: theme.colors.mutedForeground }]}>
              {formatDate(item.searchedAt)}
            </Text>
            {item.product ? (
              <View style={styles.resultInfo}>
                <Text style={[styles.resultText, { color: theme.colors.mutedForeground }]}>
                  Found: {item.product.title?.substring(0, 40)}...
                </Text>
                <Text style={[styles.priceText, { color: theme.colors.primary }]}>
                  ${item.product.currentPrice?.toFixed(2)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + 16,
            paddingBottom: insets.bottom + 16,
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
                { backgroundColor: theme.colors.card, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="trash-2" size={16} color={theme.colors.danger} />
              <Text style={[styles.clearText, { color: theme.colors.danger }]}>
                Clear History
              </Text>
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
              message="Your recent product searches will appear here."
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
    paddingHorizontal: 16,
  },
  emptyContent: {
    flexGrow: 1,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6,
  },
  clearText: {
    fontSize: 14,
    fontWeight: "500",
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyContent: {
    flex: 1,
  },
  queryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  queryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 12,
    marginBottom: 8,
  },
  resultInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultText: {
    fontSize: 13,
    flex: 1,
  },
  priceText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
