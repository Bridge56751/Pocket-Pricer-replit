import React, { useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Pressable, Text, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getSearchHistory } from "@/lib/storage";
import type { SearchHistoryItem } from "@/types/product";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `about ${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [activeTab, setActiveTab] = useState<"recent" | "all">("recent");
  const [recentScans, setRecentScans] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadRecentScans = useCallback(async () => {
    setIsLoading(true);
    try {
      const history = await getSearchHistory();
      setRecentScans(history);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecentScans();
    }, [loadRecentScans])
  );

  const handleScanProduct = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("MainTabs", { screen: "CameraTab" } as any);
  };

  const handleViewScan = (scan: SearchHistoryItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("MainTabs", { screen: "HistoryTab" } as any);
  };

  const displayedScans = activeTab === "recent" 
    ? recentScans.slice(0, 5) 
    : recentScans;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require("../../assets/images/icon.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.appName, { color: theme.colors.primary }]}>
              Price It
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <Pressable 
              style={styles.headerIcon}
              onPress={() => navigation.navigate("MainTabs", { screen: "ProfileTab" } as any)}
            >
              <Feather name="user" size={22} color={theme.colors.mutedForeground} />
            </Pressable>
            <Pressable 
              style={styles.headerIcon}
              onPress={() => navigation.navigate("MainTabs", { screen: "HistoryTab" } as any)}
            >
              <Feather name="clock" size={22} color={theme.colors.mutedForeground} />
            </Pressable>
            <Pressable 
              style={styles.headerIcon}
              onPress={() => navigation.navigate("MainTabs", { screen: "ProfileTab" } as any)}
            >
              <Feather name="settings" size={22} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.heroCard, { backgroundColor: theme.colors.card }]}>
          <Text style={[styles.heroTitle, { color: theme.colors.foreground }]}>
            Discover Product Values
          </Text>
          <Text style={[styles.heroDescription, { color: theme.colors.mutedForeground }]}>
            Scan any product to instantly see what it's selling for on eBay and more.
          </Text>

          <Pressable
            onPress={handleScanProduct}
            style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
          >
            <LinearGradient
              colors={["#34D399", "#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.scanButton}
            >
              <Feather name="camera" size={20} color="#fff" />
              <Text style={styles.scanButtonText}>Scan Product</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={[styles.tabsContainer, { backgroundColor: theme.colors.card }]}>
          <Pressable
            onPress={() => setActiveTab("recent")}
            style={[
              styles.tab,
              activeTab === "recent" && styles.tabActive,
              activeTab === "recent" && { borderBottomColor: theme.colors.primary }
            ]}
          >
            <Feather 
              name="clock" 
              size={16} 
              color={activeTab === "recent" ? theme.colors.foreground : theme.colors.mutedForeground} 
            />
            <Text style={[
              styles.tabText,
              { color: activeTab === "recent" ? theme.colors.foreground : theme.colors.mutedForeground }
            ]}>
              Recent Scans
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("all")}
            style={[
              styles.tab,
              activeTab === "all" && styles.tabActive,
              activeTab === "all" && { borderBottomColor: theme.colors.primary }
            ]}
          >
            <Feather 
              name="grid" 
              size={16} 
              color={activeTab === "all" ? theme.colors.foreground : theme.colors.mutedForeground} 
            />
            <Text style={[
              styles.tabText,
              { color: activeTab === "all" ? theme.colors.foreground : theme.colors.mutedForeground }
            ]}>
              All Scans
            </Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <SkeletonLoader count={3} type="card" />
          </View>
        ) : displayedScans.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: theme.colors.card }]}>
            <Feather name="camera" size={48} color={theme.colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
              No scans yet
            </Text>
            <Text style={[styles.emptyDescription, { color: theme.colors.mutedForeground }]}>
              Tap "Scan Product" to identify items and see their eBay values
            </Text>
          </View>
        ) : (
          <View style={styles.scansList}>
            {displayedScans.map((scan, index) => (
              <Animated.View 
                key={scan.id} 
                entering={FadeInDown.delay(index * 50).duration(300)}
              >
                <Pressable
                  onPress={() => handleViewScan(scan)}
                  style={({ pressed }) => [
                    styles.scanCard,
                    { backgroundColor: theme.colors.card, opacity: pressed ? 0.8 : 1 }
                  ]}
                >
                  <View style={styles.scanImageContainer}>
                    {scan.product?.imageUrl ? (
                      <Image
                        source={{ uri: scan.product.imageUrl }}
                        style={styles.scanImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.scanImagePlaceholder, { backgroundColor: theme.colors.muted }]}>
                        <Feather name="package" size={24} color={theme.colors.mutedForeground} />
                      </View>
                    )}
                  </View>
                  <View style={styles.scanInfo}>
                    <Text 
                      style={[styles.scanTitle, { color: theme.colors.foreground }]}
                      numberOfLines={1}
                    >
                      {scan.query}
                    </Text>
                    <Text 
                      style={[styles.scanBrand, { color: theme.colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {scan.product?.condition || "Product Search"}
                    </Text>
                    <View style={styles.scanMeta}>
                      <Text style={[styles.scanPrice, { color: theme.colors.primary }]}>
                        {scan.product?.currentPrice 
                          ? `$${scan.product.currentPrice.toFixed(0)}` 
                          : "View Results"}
                      </Text>
                      <View style={styles.scanTime}>
                        <Feather name="clock" size={12} color={theme.colors.mutedForeground} />
                        <Text style={[styles.scanTimeText, { color: theme.colors.mutedForeground }]}>
                          {formatTimeAgo(scan.searchedAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.fabContainer, { bottom: insets.bottom + 90 }]}>
        <Pressable
          onPress={handleScanProduct}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 }
          ]}
        >
          <Feather name="camera" size={24} color="#fff" />
        </Pressable>
      </View>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 10,
  },
  appName: {
    fontSize: 22,
    fontWeight: "700",
  },
  headerIcons: {
    flexDirection: "row",
    gap: 16,
  },
  headerIcon: {
    padding: 4,
  },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  tabsContainer: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 16,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loadingContainer: {
    marginTop: 8,
  },
  emptyState: {
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  scansList: {
    gap: 12,
  },
  scanCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 12,
  },
  scanImageContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: "hidden",
    marginRight: 12,
  },
  scanImage: {
    width: "100%",
    height: "100%",
  },
  scanImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  scanInfo: {
    flex: 1,
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  scanBrand: {
    fontSize: 13,
    marginBottom: 4,
  },
  scanMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  scanPrice: {
    fontSize: 15,
    fontWeight: "700",
  },
  scanTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  scanTimeText: {
    fontSize: 12,
  },
  fabContainer: {
    position: "absolute",
    right: 20,
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
