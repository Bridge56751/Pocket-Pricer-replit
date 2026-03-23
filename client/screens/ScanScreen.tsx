import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Text, ScrollView, Image, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as StoreReview from "expo-store-review";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  withSpring,
} from "react-native-reanimated";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { getSearchHistory, addSearchHistory } from "@/lib/storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { storeImage } from "@/lib/image-store";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { SearchHistoryItem } from "@/types/product";
import type { RootStackParamList, CapturedPhoto } from "@/navigation/RootStackNavigator";

type ScanScreenRouteProp = RouteProp<RootStackParamList, "Home">;

const SCAN_STEPS = [
  { label: "Uploading image...", icon: "upload" as const },
  { label: "Matching product...", icon: "search" as const },
  { label: "Finding best prices...", icon: "dollar-sign" as const },
];

function ScanningImage({ uri, style, containerStyle }: { uri: string; style: any; containerStyle?: any }) {
  const shimmerTranslate = useSharedValue(-1);
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    shimmerTranslate.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerTranslate.value * 400 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  return (
    <View style={[containerStyle, { position: "relative" }]}>
      <Animated.View
        style={[
          {
            position: "absolute",
            top: -3,
            left: -3,
            right: -3,
            bottom: -3,
            borderRadius: 19,
            borderWidth: 2.5,
            borderColor: "#047857",
          },
          glowStyle,
        ]}
      />
      <View style={{ borderRadius: 16, overflow: "hidden", flex: 1 }}>
        <Image source={{ uri }} style={style} resizeMode="cover" />
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 120,
            },
            shimmerStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.15)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function AnimatedProgressBar({ step, totalSteps, color, trackColor }: { step: number; totalSteps: number; color: string; trackColor: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const target = Math.min((step + 1) / totalSteps, 1);
    progress.value = withSpring(target, { damping: 15, stiffness: 60 });
  }, [step, totalSteps]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
  }));

  return (
    <View style={[styles.scanOverlayProgressBar, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[styles.scanOverlayProgressFill, { backgroundColor: color }, animatedStyle]}
      />
    </View>
  );
}

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

const FREE_SCAN_LIMIT = 3;

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<ScanScreenRouteProp>();

  const { getDeviceId, getScansUsed, setScansUsed: persistScansUsed, incrementScans } = useAuth();
  const { isPro, isReady: rcReady } = useRevenueCat();
  const queryClient = useQueryClient();
  
  const [recentScans, setRecentScans] = useState<SearchHistoryItem[]>([]);
  const [scansUsed, setScansUsed] = useState(0);
  const [cachedDeviceId, setCachedDeviceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingProgress, setAnalyzingProgress] = useState("");
  const [analyzingCount, setAnalyzingCount] = useState({ current: 0, total: 0 });
  const [currentStep, setCurrentStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scannedPhotoUri, setScannedPhotoUri] = useState<string | null>(null);
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

  useEffect(() => {
    (async () => {
      const id = await getDeviceId();
      setCachedDeviceId(id);
    })();
  }, [getDeviceId]);

  const { data: deviceStats } = useQuery({
    queryKey: ["/api/device-stats", cachedDeviceId],
    queryFn: async () => {
      if (!cachedDeviceId) return null;
      const res = await fetch(
        new URL(`/api/device-stats/${cachedDeviceId}`, getApiUrl()).toString()
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ memberDays: number; scansToday: number; streak: number }>;
    },
    enabled: !!cachedDeviceId,
    staleTime: 30000,
  });

  const processPhotos = useCallback(async (photos: CapturedPhoto[]) => {
    if (photos.length === 0 || processingRef.current) return;
    
    processingRef.current = true;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setScannedPhotoUri(photos[0].uri);
    setCurrentStep(0);
    setAnalyzingCount({ current: 1, total: 3 });
    setAnalyzingProgress(SCAN_STEPS[0].label);
    
    try {
      if (rcReady && !isPro) {
        const scansUsed = await getScansUsed();
        if (scansUsed >= FREE_SCAN_LIMIT) {
          setIsAnalyzing(false);
          setAnalyzingProgress("");
          processingRef.current = false;
          navigation.navigate("Paywall");
          return;
        }
      }

      setCurrentStep(1);
      setAnalyzingProgress(SCAN_STEPS[1].label);
      setAnalyzingCount({ current: 2, total: 3 });
      
      let results: any = null;
      let productInfo: any = null;
      let usedLens = false;

      try {
        const deviceId = await getDeviceId();
        const scanHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId,
          "X-Is-Pro": isPro ? "true" : "false",
        };
        const lensResponse = await fetch(
          new URL("/api/scan-with-lens", getApiUrl()).toString(),
          {
            method: "POST",
            headers: scanHeaders,
            body: JSON.stringify({ imageBase64: `data:image/jpeg;base64,${photos[0].base64}` }),
          }
        );
        
        if (lensResponse.status === 403) {
          const lensData = await lensResponse.json();
          if (lensData.limitReached) {
            setIsAnalyzing(false);
            setAnalyzingProgress("");
            processingRef.current = false;
            navigation.navigate("Paywall");
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

      if (!results || !results.listings?.length) {
        setIsAnalyzing(false);
        setAnalyzingProgress("");
        processingRef.current = false;
        setErrorMessage("Could not identify the product. Please try again with a clearer photo of the product or packaging.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

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

      setIsAnalyzing(false);
      setAnalyzingProgress("");
      setScannedPhotoUri(null);
      processingRef.current = false;

      let newScanCount = 0;
      if (!isPro) {
        const serverCount = results.totalScans;
        if (typeof serverCount === "number" && serverCount > 0) {
          await persistScansUsed(serverCount);
          newScanCount = serverCount;
        } else {
          newScanCount = await incrementScans().catch(() => 0);
        }
        setScansUsed(newScanCount);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate("SearchResults", { results: enrichedResults });

      addSearchHistory(historyItem).catch(() => {});
      loadRecentScans();
      queryClient.invalidateQueries({ queryKey: ["/api/device-stats"] });

      if (Platform.OS !== "web") {
        (async () => {
          try {
            const Constants = await import("expo-constants");
            const isExpoGo = Constants.default?.appOwnership === "expo";
            if (!isExpoGo) {
              const appsFlyer = await import("react-native-appsflyer");
              appsFlyer.default.logEvent(
                "af_search",
                { af_search_string: queryString },
                () => {},
                () => {}
              );
            }
          } catch {}
        })();
      }

      if (newScanCount >= 5 && Platform.OS !== "web") {
        (async () => {
          try {
            const alreadyPrompted = await AsyncStorage.getItem("@pocket_pricer_rating_prompted");
            if (alreadyPrompted === "true") return;
            await AsyncStorage.setItem("@pocket_pricer_rating_prompted", "true");
            const isAvailable = await StoreReview.isAvailableAsync();
            if (isAvailable) {
              setTimeout(() => { StoreReview.requestReview().catch(() => {}); }, 2000);
            }
          } catch {}
        })();
      }
      
    } catch (error) {
      console.error("Processing failed:", error);
      setIsAnalyzing(false);
      setAnalyzingProgress("");
      processingRef.current = false;
      const errorMsg = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      if (errorMsg.includes("401") || errorMsg.includes("Not authenticated")) {
        setErrorMessage("Authentication error. Please try again.");
      } else if (errorMsg.includes("429") || errorMsg.includes("rate")) {
        setErrorMessage("Too many requests. Please wait a moment and try again.");
      } else if (errorMsg.includes("500")) {
        setErrorMessage("Server error. Please try again later.");
      } else {
        setErrorMessage(errorMsg);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [loadRecentScans, navigation, rcReady, isPro, getScansUsed, persistScansUsed, incrementScans, getDeviceId]);

  useEffect(() => {
    const photosToProcess = route.params?.photosToProcess;
    if (photosToProcess && photosToProcess.length > 0) {
      navigation.setParams({ photosToProcess: undefined });
      processPhotos(photosToProcess);
    }
  }, [route.params?.photosToProcess, processPhotos, navigation]);

  const checkAndNavigate = useCallback(async () => {
    if (!rcReady) return;
    const count = await getScansUsed();
    setScansUsed(count);
    if (!isPro && count >= FREE_SCAN_LIMIT) {
      navigation.navigate("Paywall");
    }
  }, [rcReady, isPro, getScansUsed, navigation]);

  useFocusEffect(
    useCallback(() => {
      loadRecentScans();
    }, [loadRecentScans])
  );

  const rcReadyRef = useRef(false);
  useEffect(() => {
    if (rcReady && !rcReadyRef.current) {
      rcReadyRef.current = true;
      checkAndNavigate();
    }
  }, [rcReady, checkAndNavigate]);

  const handleScanProduct = async () => {
    if (rcReady && !isPro) {
      const scansUsed = await getScansUsed();
      if (scansUsed >= FREE_SCAN_LIMIT) {
        navigation.navigate("Paywall");
        return;
      }
    }
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
      <View style={[styles.heroTopFill, { height: insets.top + 200 }]} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
            colors={["#0A3622", "#14532D", "#1A6B3C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.heroCard, { paddingTop: insets.top + 16, paddingBottom: isPro ? 16 : 24 }]}
          >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Feather name="tag" size={20} color="#FFFFFF" style={{ transform: [{ scaleX: -1 }] }} />
              <Text style={[styles.appName, { color: "#FFFFFF" }]}>
                Pocket Pricer
              </Text>
            </View>
            <Pressable 
              style={styles.headerIcon}
              onPress={() => navigation.navigate("Settings")}
            >
              <Feather name="settings" size={22} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>

            <Text style={styles.heroTitle}>
              Scan & Price
            </Text>
            <Text style={styles.heroDescription}>
              Point your camera at any product to get instant market pricing and sales data
            </Text>

            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>STREAK</Text>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{deviceStats?.streak ?? 0}</Text>
                  <Text style={styles.metricUnit}>d</Text>
                </View>
                <View style={styles.streakDots}>
                  {Array.from({ length: Math.min(deviceStats?.streak ?? 0, 7) }).map((_, i) => (
                    <View key={i} style={styles.streakDot} />
                  ))}
                </View>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>MEMBER</Text>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{deviceStats?.memberDays ?? 0}</Text>
                  <Text style={styles.metricUnit}>d</Text>
                </View>
                <Text style={styles.metricSub}>since joined</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>TODAY</Text>
                <Text style={styles.metricValue}>{deviceStats?.scansToday ?? 0}</Text>
                <Text style={styles.metricSub}>scans</Text>
              </View>
            </View>

            <Pressable
              onPress={handleScanProduct}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
            >
              <View style={[styles.scanButton, isPro ? { borderColor: "rgba(212,169,38,0.4)" } : undefined]}>
                <View style={styles.scanButtonLeft}>
                  <Feather name="camera" size={20} color={isPro ? "#D4A926" : "#14532D"} />
                  <Text style={[styles.scanButtonText, isPro ? { color: "#B8941F" } : undefined]}>Scan Product</Text>
                </View>
                {isPro ? (
                  <LinearGradient
                    colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.scanButtonBadge}
                  >
                    <Feather name="star" size={11} color="#3D2E00" />
                    <Text style={[styles.scanButtonBadgeText, { color: "#3D2E00" }]}>PRO</Text>
                  </LinearGradient>
                ) : (
                  <Text style={styles.scanButtonCount}>
                    {scansUsed >= FREE_SCAN_LIMIT
                      ? "0 scans left"
                      : `${FREE_SCAN_LIMIT - scansUsed} scan${FREE_SCAN_LIMIT - scansUsed === 1 ? "" : "s"} left`}
                  </Text>
                )}
              </View>
            </Pressable>

            {isPro ? null : (
              <Pressable
                onPress={() => navigation.navigate("Paywall", { context: "scan" })}
                style={({ pressed }) => [styles.proUpsellCard, { opacity: pressed ? 0.9 : 1 }]}
              >
                <View style={styles.proUpsellLeft}>
                  <LinearGradient
                    colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.proUpsellBadge}
                  >
                    <Feather name="star" size={11} color="#3D2E00" />
                    <Text style={styles.proUpsellBadgeText}>PRO</Text>
                  </LinearGradient>
                  <Text style={styles.proUpsellTitle}>Unlimited scans, sales prices & Buy Score</Text>
                  <Text style={styles.proUpsellSub}>3-day free trial · as low as $4.99/mo</Text>
                </View>
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.4)" />
              </Pressable>
            )}
          </LinearGradient>

        <View style={styles.belowHeroContent}>
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
              Scan a product to see its value
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
        </View>
      </ScrollView>
      
      {isAnalyzing ? (
        <View style={[styles.scanOverlay, { backgroundColor: theme.colors.background }]}>
          <View style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, flex: 1, paddingHorizontal: 24 }}>
            {scannedPhotoUri ? (
              <ScanningImage
                uri={scannedPhotoUri}
                style={styles.scanOverlayImage}
                containerStyle={styles.scanOverlayImageContainer}
              />
            ) : null}
            <View style={styles.scanOverlayContent}>
              <Text style={[styles.scanOverlayTitle, { color: theme.colors.foreground }]}>
                Scanning product
              </Text>
              <Text style={[styles.scanStepText, { color: theme.colors.mutedForeground }]}>
                {SCAN_STEPS[Math.min(currentStep, SCAN_STEPS.length - 1)].label}
              </Text>
              <AnimatedProgressBar
                step={currentStep}
                totalSteps={SCAN_STEPS.length}
                color={theme.colors.primary}
                trackColor={theme.colors.muted}
              />
            </View>
          </View>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={[styles.scanOverlay, { backgroundColor: theme.colors.background }]}>
          <View style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, flex: 1, paddingHorizontal: 24 }}>
            {scannedPhotoUri ? (
              <View style={[styles.scanOverlayImageContainer, styles.scanOverlayImageError]}>
                <Image
                  source={{ uri: scannedPhotoUri }}
                  style={styles.scanOverlayImage}
                  resizeMode="cover"
                />
                <View style={styles.scanErrorIconContainer}>
                  <Feather name="alert-circle" size={24} color={theme.colors.danger} />
                </View>
              </View>
            ) : null}
            <View style={styles.scanOverlayContent}>
              <Text style={[styles.scanErrorTitle, { color: theme.colors.foreground }]}>
                Scan failed
              </Text>
              <Text style={[styles.scanErrorMessage, { color: theme.colors.mutedForeground }]}>
                {errorMessage}
              </Text>
              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setScannedPhotoUri(null);
                  navigation.navigate("CameraScan");
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, width: "100%" }]}
              >
                <LinearGradient
                  colors={["#EF4444", "#DC2626", "#B91C1C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.scanErrorRetryButton}
                >
                  <Feather name="camera" size={18} color="#fff" />
                  <Text style={styles.scanErrorRetryText}>Try again</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => {
                  setErrorMessage(null);
                  setScannedPhotoUri(null);
                }}
                style={({ pressed }) => [
                  styles.scanErrorBackButton,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={[styles.scanErrorBackText, { color: theme.colors.foreground }]}>
                  Go back
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroTopFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0A3622",
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  content: {
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerAppIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    position: "absolute" as const,
    right: 0,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    marginBottom: 0,
  },
  belowHeroContent: {
    paddingHorizontal: 20,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 2,
    color: "#86EFAC",
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800" as const,
    marginBottom: 10,
    color: "#FFFFFF",
  },
  heroDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    color: "rgba(255,255,255,0.75)",
  },
  metricsRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  metricValueRow: {
    flexDirection: "row" as const,
    alignItems: "baseline" as const,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: "800" as const,
    color: "#4ADE80",
  },
  metricUnit: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "rgba(74,222,128,0.7)",
    marginLeft: 2,
  },
  metricSub: {
    fontSize: 11,
    fontWeight: "500" as const,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
  },
  streakDots: {
    flexDirection: "row" as const,
    gap: 4,
    marginTop: 4,
  },
  streakDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
  },
  scanButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 18,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "rgba(20, 83, 45, 0.3)",
  },
  scanButtonLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  scanButtonText: {
    color: "#14532D",
    fontSize: 17,
    fontWeight: "700" as const,
  },
  scanButtonCount: {
    color: "#14532D",
    fontSize: 13,
    fontWeight: "600" as const,
    opacity: 0.6,
  },
  scanButtonBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#14532D",
  },
  scanButtonBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  proUpsellCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: "rgba(212, 169, 38, 0.55)",
  },
  proUpsellLeft: {
    flex: 1,
    gap: 4,
  },
  proUpsellBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start" as const,
    marginBottom: 2,
    overflow: "hidden" as const,
  },
  proUpsellBadgeText: {
    fontSize: 11,
    fontWeight: "800" as const,
    color: "#3D2E00",
    letterSpacing: 0.5,
  },
  proUpsellTitle: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#F0D264",
  },
  proUpsellSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  scanOverlayImageContainer: {
    flex: 1,
    borderRadius: 16,
    maxHeight: "60%",
  },
  scanOverlayImageError: {
    borderWidth: 3,
    borderColor: "#EF4444",
  },
  scanOverlayImage: {
    width: "100%",
    height: "100%",
  },
  scanErrorIconContainer: {
    position: "absolute",
    bottom: -12,
    alignSelf: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  scanOverlayContent: {
    alignItems: "center",
    paddingTop: 28,
    gap: 12,
    width: "100%",
  },
  scanOverlayTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 4,
  },
  scanOverlayProgressBar: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    width: "85%",
    marginBottom: 8,
  },
  scanOverlayProgressFill: {
    height: "100%",
    borderRadius: 2,
  },
  scanStepText: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 4,
  },
  scanErrorTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  scanErrorMessage: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 12,
  },
  scanErrorRetryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    width: "100%",
  },
  scanErrorRetryText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  scanErrorBackButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    width: "100%",
  },
  scanErrorBackText: {
    fontSize: 17,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
