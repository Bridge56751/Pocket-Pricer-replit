import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, Text, TextInput, ScrollView } from "react-native";
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
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import type { SearchHistoryItem } from "@/types/product";
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
      const results = await response.json();

      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: searchQuery,
        product: results.listings?.[0] || null,
        searchedAt: new Date().toISOString(),
      };

      await addSearchHistory(historyItem);
      await loadRecentSearches();

      navigation.navigate("SearchResults", { results });
    } catch (error) {
      console.error("Search failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSearching(false);
      setSearchQuery("");
    }
  }, [searchQuery, navigation]);

  const handleRecentSearch = (query: string) => {
    setSearchQuery(query);
  };

  const recentQueries = [...new Set(recentSearches.map(s => s.query))].slice(0, 6);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + theme.spacing.xl,
            paddingBottom: tabBarHeight + theme.spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
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
          Search any product to see real eBay listings with prices
        </Text>

        {isSearching ? (
          <View style={styles.searchingContainer}>
            <SkeletonLoader count={3} type="card" />
          </View>
        ) : null}
        
        {recentQueries.length > 0 && !isSearching ? (
          <View style={styles.recentSection}>
            <View style={styles.sectionHeader}>
              <Feather name="clock" size={16} color={theme.colors.mutedForeground} />
              <Text style={[styles.sectionTitle, { color: theme.colors.mutedForeground }]}>
                Recent Searches
              </Text>
            </View>
            <View style={styles.recentTags}>
              {recentQueries.map((query, index) => (
                <Animated.View key={query} entering={FadeInDown.delay(index * 50).duration(300)}>
                  <Pressable
                    onPress={() => handleRecentSearch(query)}
                    style={({ pressed }) => [
                      styles.recentTag,
                      { backgroundColor: theme.colors.card, opacity: pressed ? 0.7 : 1 }
                    ]}
                  >
                    <Text style={[styles.recentTagText, { color: theme.colors.foreground }]}>
                      {query}
                    </Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </View>
        ) : null}

        {!isSearching && recentQueries.length === 0 && !isLoading ? (
          <EmptyState
            title="Search eBay Listings"
            message="Enter a product name to find current active listings and compare prices"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    flexGrow: 1,
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
    marginTop: 24,
  },
  recentSection: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  recentTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recentTag: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  recentTagText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
