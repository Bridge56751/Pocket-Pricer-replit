import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Text, ScrollView, Image, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest } from "@/lib/query-client";
import { storeImage } from "@/lib/image-store";
import { useAuth } from "@/contexts/AuthContext";
import UpgradeModal from "@/components/UpgradeModal";
import type { SearchHistoryItem } from "@/types/product";
import type { RootStackParamList, CapturedPhoto } from "@/navigation/RootStackNavigator";

type ScanScreenRouteProp = RouteProp<RootStackParamList, "Home">;

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
  const route = useRoute<ScanScreenRouteProp>();

  const { user, token, refreshUser } = useAuth();
  
  const [recentScans, setRecentScans] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState("");
  const [analyzingCount, setAnalyzingCount] = useState({ current: 0, total: 0 });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processingRef = useRef(false);

  const loadRecentScans = useCallback(async () => {
    setIsLoading(true);
    try {
      const history = await getSearchHistory();
      setRecentScans(history);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const processPhotos = useCallback(async (photos: CapturedPhoto[]) => {
    if (photos.length === 0 || processingRef.current) return;
    
    processingRef.current = true;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setAnalyzingCount({ current: 1, total: 2 });
    setAnalyzingProgress(photos.length > 1 
      ? `Analyzing ${photos.length} photos of your product...` 
      : "Identifying product...");
    
    try {
      if (!token) {
        setIsAnalyzing(false);
        setAnalyzingProgress("");
        processingRef.current = false;
        setErrorMessage("Please sign in to scan products.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Try Google Lens first for exact product matching
      setAnalyzingProgress("Searching with visual matching...");
      
      let results: any = null;
      let productInfo: any = null;
      let usedLens = false;

      try {
        const lensResponse = await apiRequest("POST", "/api/scan-with-lens", {
          imageBase64: `data:image/jpeg;base64,${photos[0].base64}`,
        }, token);
        
        if (lensResponse.status === 403) {
          const lensData = await lensResponse.json();
          if (lensData.limitReached) {
            setIsAnalyzing(false);
            setAnalyzingProgress("");
            processingRef.current = false;
            setShowUpgradeModal(true);
            return;
          }
        }

        if (lensResponse.ok) {
          results = await lensResponse.json();
          usedLens = true;
          productInfo = {
            name: results.productName || results.query,
            brand: "",
            category: "",
            description: results.productDescription || "",
          };
        }
      } catch (lensError) {
        console.log("Lens search failed:", lensError);
      }

      // If Lens didn't find results, show error
      if (!results || !results.listings?.length) {
        setIsAnalyzing(false);
        setAnalyzingProgress("");
        processingRef.current = false;
        setErrorMessage("Could not identify the product. Please try again with a clearer photo of the product or packaging.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      
      await refreshUser();

      const scannedImageId = storeImage(`data:image/jpeg;base64,${photos[0].base64}`);
      const enrichedResults = {
        ...results,
        scannedImageId,
        productInfo,
        usedLens,
      };

      const queryString = typeof results.query === 'string' 
        ? results.query 
        : (typeof productInfo?.name === 'string' ? productInfo.name : "Visual Search");
      
      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: queryString,
        product: results.listings?.[0] || null,
        searchedAt: new Date().toISOString(),
        results: enrichedResults,
      };

      await addSearchHistory(historyItem);
      await loadRecentScans();
      
      setIsAnalyzing(false);
      setAnalyzingProgress("");
      processingRef.current = false;
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate("SearchResults", { results: enrichedResults });
      
    } catch (error) {
      console.error("Processing failed:", error);
      setIsAnalyzing(false);
      setAnalyzingProgress("");
      processingRef.current = false;
      const errorMsg = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      if (errorMsg.includes("401") || errorMsg.includes("Not authenticated")) {
        setErrorMessage("Session expired. Please sign in again.");
      } else if (errorMsg.includes("429") || errorMsg.includes("rate")) {
        setErrorMessage("Too many requests. Please wait a moment and try again.");
      } else if (errorMsg.includes("500")) {
        setErrorMessage("Server error. Please try again later.");
      } else {
        setErrorMessage(errorMsg);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [loadRecentScans, navigation]);

  useEffect(() => {
    const photosToProcess = route.params?.photosToProcess;
    if (photosToProcess && photosToProcess.length > 0) {
      navigation.setParams({ photosToProcess: undefined });
      processPhotos(photosToProcess);
    }
  }, [route.params?.photosToProcess, processPhotos, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadRecentScans();
    }, [loadRecentScans])
  );

  const handleScanProduct = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("CameraScan");
  };

  const handleViewScan = (scan: SearchHistoryItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (scan.results) {
      navigation.navigate("SearchResults", { results: scan.results });
    }
  };

  const displayedScans = recentScans.slice(0, 15);

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
          <View style={styles.headerSpacer} />
          <Text style={[styles.appName, { color: theme.colors.primary }]}>
            Pocket Pricer
          </Text>
          <Pressable 
            style={styles.headerIcon}
            onPress={() => navigation.navigate("Settings")}
          >
            <Feather name="settings" size={22} color={theme.colors.mutedForeground} />
          </Pressable>
        </View>

        {isAnalyzing ? (
          <View style={[styles.analyzingCard, { backgroundColor: theme.colors.card }]}>
            <View style={styles.analyzingContent}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <View style={styles.analyzingText}>
                <Text style={[styles.analyzingTitle, { color: theme.colors.foreground }]}>
                  Analyzing your product...
                </Text>
                <Text style={[styles.analyzingSubtitle, { color: theme.colors.mutedForeground }]}>
                  {analyzingProgress}
                </Text>
              </View>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.muted }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: theme.colors.primary,
                    width: `${(analyzingCount.current / analyzingCount.total) * 100}%` 
                  }
                ]} 
              />
            </View>
          </View>
        ) : (
          <View style={[styles.heroCard, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.heroTitle, { color: theme.colors.foreground }]}>
              Discover Product Values
            </Text>
            <Text style={[styles.heroDescription, { color: theme.colors.mutedForeground }]}>
              Scan any product to instantly see prices across Amazon, Walmart, Target, and more.
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
        )}

        {errorMessage ? (
          <Pressable 
            onPress={() => setErrorMessage(null)}
            style={[styles.errorBanner, { backgroundColor: theme.colors.danger + "20" }]}
          >
            <Feather name="alert-circle" size={18} color={theme.colors.danger} />
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              {errorMessage}
            </Text>
            <Feather name="x" size={16} color={theme.colors.danger} />
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Feather name="clock" size={18} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Recent Scans
          </Text>
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
              Tap "Scan Product" to identify items and see their market value
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
                    {(scan.thumbnailUrl || scan.results?.listings?.[0]?.imageUrl) ? (
                      <Image
                        source={{ uri: scan.thumbnailUrl || scan.results?.listings?.[0]?.imageUrl }}
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
                      {(typeof scan.results?.productInfo === 'object' ? scan.results?.productInfo?.name : null) 
                        || scan.product?.title 
                        || (typeof scan.query === 'string' ? scan.query : 'Product')}
                    </Text>
                    <Text 
                      style={[styles.scanCondition, { color: theme.colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {scan.results?.listings?.[0]?.condition || "New"}
                    </Text>
                    <View style={styles.scanMeta}>
                      <Text style={[styles.scanPrice, { color: theme.colors.primary }]}>
                        ${(scan.avgPrice || scan.results?.avgListPrice)?.toFixed(0) || "0"}
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
      
      <UpgradeModal 
        visible={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
      />
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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerSpacer: {
    width: 40,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  appName: {
    fontSize: 24,
    fontWeight: "700",
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  heroTitle: {
    fontSize: 22,
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
    borderRadius: 14,
    gap: 10,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  analyzingCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  analyzingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 16,
  },
  analyzingText: {
    flex: 1,
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  analyzingSubtitle: {
    fontSize: 14,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
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
  scanCondition: {
    fontSize: 13,
    marginBottom: 4,
  },
  scanMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scanPrice: {
    fontSize: 16,
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
});
