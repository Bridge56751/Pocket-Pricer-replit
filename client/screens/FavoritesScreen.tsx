import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, Pressable, Text, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getFavorites, removeFavorite } from "@/lib/storage";
import type { FavoriteItem } from "@/types/product";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useDesignTokens();

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [])
  );

  const loadFavorites = async () => {
    setIsLoading(true);
    try {
      const data = await getFavorites();
      setFavorites(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFavorite = async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await removeFavorite(id);
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  const handleViewListing = async (link: string) => {
    if (link) {
      await Linking.openURL(link);
    }
  };

  const renderItem = ({ item, index }: { item: FavoriteItem; index: number }) => {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
        <View style={[styles.favoriteCard, { backgroundColor: theme.colors.card }]}>
          <Image
            source={{ uri: item.product.imageUrl }}
            style={styles.productImage}
            contentFit="cover"
          />
          <View style={styles.cardContent}>
            <View style={[styles.ebayBadge, { backgroundColor: "#3665F3" }]}>
              <Text style={styles.ebayBadgeText}>eBay</Text>
            </View>
            <Text 
              style={[styles.productTitle, { color: theme.colors.foreground }]}
              numberOfLines={2}
            >
              {item.product.title}
            </Text>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: theme.colors.foreground }]}>
                ${item.product.currentPrice?.toFixed(2)}
              </Text>
              <Text style={[styles.condition, { color: theme.colors.mutedForeground }]}>
                {item.product.condition}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => handleViewListing(item.product.link || "")}
                style={({ pressed }) => [
                  styles.viewButton,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="external-link" size={14} color={theme.colors.foreground} />
                <Text style={[styles.viewButtonText, { color: theme.colors.foreground }]}>
                  View
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleRemoveFavorite(item.id)}
                style={({ pressed }) => [
                  styles.removeButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="trash-2" size={16} color={theme.colors.danger} />
              </Pressable>
            </View>
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
            paddingBottom: tabBarHeight + 16,
          },
          favorites.length === 0 && !isLoading && styles.emptyContent,
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={favorites}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonLoader count={4} type="card" />
          ) : (
            <EmptyState
              image={require("../../assets/images/empty-favorites.png")}
              title="No Favorites Yet"
              message="Save listings you're interested in from the search results."
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
  favoriteCard: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  productImage: {
    width: 100,
    height: 130,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  ebayBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  ebayBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  productTitle: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
    marginBottom: 6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
  },
  condition: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: "500",
  },
  removeButton: {
    padding: 6,
  },
});
