import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getSearchHistory, clearSearchHistory } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SearchHistoryItem } from "@/types/product";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useDesignTokens();
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

  const handleItemPress = (item: SearchHistoryItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate directly to results if available
    if (item.results) {
      // Strip large base64 image data to prevent UI freeze
      const { scannedImageUri, ...cleanResults } = item.results as any;
      navigation.navigate("SearchResults", { results: cleanResults });
    } else {
      // Fallback: navigate to home with query pre-filled
      navigation.navigate("Home", { prefillQuery: item.query });
    }
  };

  const renderItem = ({ item, index }: { item: SearchHistoryItem; index: number }) => {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <Pressable
          onPress={() => handleItemPress(item)}
          style={({ pressed }) => [
            styles.historyCard,
            { backgroundColor: theme.colors.card, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          {(item.thumbnailUrl || item.results?.listings?.[0]?.imageUrl) ? (
            <Image 
              source={{ uri: item.thumbnailUrl || item.results?.listings?.[0]?.imageUrl }} 
              style={styles.thumbnail}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.colors.muted }]}>
              <Feather name="package" size={24} color={theme.colors.mutedForeground} />
            </View>
          )}
          
          <View style={styles.historyContent}>
            <Text 
              style={[styles.productName, { color: theme.colors.foreground }]}
              numberOfLines={2}
            >
              {(item.results as any)?.productName || (item.results as any)?.productInfo?.name || item.product?.title || item.query}
            </Text>
            
            <Text style={[styles.timestamp, { color: theme.colors.mutedForeground }]}>
              {formatDate(item.searchedAt)}
            </Text>
            
            <View style={styles.priceRow}>
              {(item.avgPrice || item.results?.avgListPrice) ? (
                <View style={styles.priceTag}>
                  <Text style={[styles.priceLabel, { color: theme.colors.mutedForeground }]}>
                    Avg:
                  </Text>
                  <Text style={[styles.priceValue, { color: theme.colors.primary }]}>
                    ${(item.avgPrice || item.results?.avgListPrice)?.toFixed(2)}
                  </Text>
                </View>
              ) : null}
              
              {(item.bestPrice || item.results?.bestBuyNow) ? (
                <View style={styles.priceTag}>
                  <Text style={[styles.priceLabel, { color: theme.colors.mutedForeground }]}>
                    Best:
                  </Text>
                  <Text style={[styles.priceValue, { color: theme.colors.success }]}>
                    ${(item.bestPrice || item.results?.bestBuyNow)?.toFixed(2)}
                  </Text>
                </View>
              ) : null}
              
              {(item.totalListings || item.results?.totalListings) ? (
                <Text style={[styles.listingsCount, { color: theme.colors.mutedForeground }]}>
                  {item.totalListings || item.results?.totalListings} listings
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>
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
            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>
                Recent Scans
              </Text>
              <Pressable
                onPress={handleClearHistory}
                style={({ pressed }) => [
                  styles.clearButton,
                  { backgroundColor: theme.colors.card, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="trash-2" size={14} color={theme.colors.danger} />
                <Text style={[styles.clearText, { color: theme.colors.danger }]}>
                  Clear
                </Text>
              </Pressable>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonLoader count={5} type="card" />
          ) : (
            <EmptyState
              image={require("../../assets/images/empty-history.png")}
              title="No Scan History"
              message="Your scanned products will appear here. Start scanning to build your history!"
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "500",
  },
  historyCard: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  thumbnail: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
  thumbnailPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  historyContent: {
    flex: 1,
    justifyContent: "center",
  },
  productName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 12,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  priceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  priceLabel: {
    fontSize: 12,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  listingsCount: {
    fontSize: 12,
  },
});
