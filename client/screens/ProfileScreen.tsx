import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Text, Alert, Platform, ActivityIndicator, Linking } from "react-native";
import Animated from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useTabBarFadeOnScroll } from "@/hooks/useTabBarFadeOnScroll";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as StoreReview from "expo-store-review";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { FREE_SCAN_LIMIT } from "@shared/scan-limits";
import { resetOnboarding } from "@/screens/OnboardingScreen";
import { triggerOnboardingReplay } from "@/components/AppContent";
import { clearSearchHistory, clearFavorites } from "@/lib/storage";
import { FREE_SCAN_LIMIT } from "@/constants/scan-limits";
import { getProfileAllowanceText } from "@/constants/scan-limits";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const tabBarFadeHandler = useTabBarFadeOnScroll({ fadeStart: 12, fadeEnd: 80 });
  const scrollRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      const id = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, []),
  );
  const { theme } = useDesignTokens();
  const { getScansUsed } = useAuth();
  const { isPro, restorePurchases } = useRevenueCat();
  const [isRestoring, setIsRestoring] = useState(false);

  const [scansUsed, setScansUsed] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [supportExpanded, setSupportExpanded] = useState(false);
  const [rateExpanded, setRateExpanded] = useState(false);

  useEffect(() => {
    getScansUsed().then(setScansUsed);
  }, []);

  const handleUpgrade = () => {
    navigation.navigate("Paywall");
  };

  const handleManageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      await Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      Alert.alert(
        "Manage Subscription",
        "To manage your subscription, open Settings on your iOS or Android device and go to Subscriptions."
      );
    }
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile Only", "Please use the mobile app to restore purchases.");
      return;
    }
    setIsRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await restorePurchases();
      if (result.success) {
        Alert.alert("Restored", "Your Pro subscription has been restored!");
      } else {
        Alert.alert("No Subscription Found", result.error || "No active subscription found for this Apple ID.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await WebBrowser.openBrowserAsync("https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html");
    } catch (error) {
      console.error("Failed to open privacy policy:", error);
    }
  };

  const handleOpenTermsOfService = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await WebBrowser.openBrowserAsync("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/");
    } catch (error) {
      console.error("Failed to open terms of service:", error);
    }
  };

  const handleDeleteLocalData = async () => {
    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await clearSearchHistory();
      await clearFavorites();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete local data:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.outerContainer}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 24 }}
        showsVerticalScrollIndicator={false}
        onScroll={tabBarFadeHandler}
        scrollEventThrottle={16}
      >
        <View style={styles.topOverscrollFill} />
        <LinearGradient
          colors={["#0A3622", "#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.heroTitleRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={styles.backButton}
            >
              <Feather name="arrow-left" size={22} color="#FFFFFF" />
            </Pressable>
            <Feather name="settings" size={20} color="rgba(255,255,255,0.7)" />
            <Text style={styles.heroTitle}>Settings</Text>
          </View>

          {isPro ? (
            <View style={styles.heroCard}>
              <View style={styles.heroCardHeader}>
                <View style={styles.heroCardHeaderLeft}>
                  <Feather name="zap" size={18} color="#F5D87A" />
                  <Text style={styles.heroCardTitle}>Subscription</Text>
                </View>
                <LinearGradient
                  colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.proBadge}
                >
                  <Feather name="star" size={10} color="#3D2E00" />
                  <Text style={styles.proBadgeText}>PRO</Text>
                </LinearGradient>
              </View>
              <Text style={styles.heroCardSubtitle}>Unlimited product scans</Text>
              <View style={{ gap: 8, marginTop: 4 }}>
                <Pressable
                  onPress={handleUpgrade}
                  style={({ pressed }) => [
                    styles.heroOutlineBtn,
                    { borderColor: "rgba(255,255,255,0.3)", opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="repeat" size={16} color="#fff" />
                  <Text style={styles.heroOutlineBtnText}>Change Plan</Text>
                </Pressable>
                <Pressable
                  onPress={handleManageSubscription}
                  style={({ pressed }) => [
                    styles.heroOutlineBtn,
                    { borderColor: "rgba(255,255,255,0.15)", opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Feather name="external-link" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={[styles.heroOutlineBtnText, { color: "rgba(255,255,255,0.7)" }]}>
                    Manage Subscription
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.heroCard}>
              <View style={styles.heroCardHeader}>
                <View style={styles.heroCardHeaderLeft}>
                  <Feather name="zap" size={18} color="#F5D87A" />
                  <Text style={styles.heroCardTitle}>Subscription</Text>
                </View>
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>Free</Text>
                </View>
              </View>
              <Text style={styles.heroCardSubtitle}>
                {getProfileAllowanceText(scansUsed)}
              </Text>
              <Pressable
                onPress={handleUpgrade}
                style={({ pressed }) => [
                  styles.goldCta,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Feather name="zap" size={18} color="#3D2E00" />
                <Text style={styles.goldCtaText}>Upgrade to Pro</Text>
              </Pressable>
              <Pressable
                onPress={handleRestorePurchases}
                disabled={isRestoring}
                style={({ pressed }) => [
                  styles.restoreBtn,
                  { opacity: pressed || isRestoring ? 0.5 : 1 },
                ]}
              >
                {isRestoring ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
                ) : (
                  <Text style={styles.restoreBtnText}>Restore Purchase</Text>
                )}
              </Pressable>
              <Text style={styles.heroLegalText}>
                Payment will be charged to your Apple ID account. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions.
              </Text>
            </View>
          )}

          <View style={styles.heroCard}>
            <View style={styles.heroCardHeader}>
              <View style={styles.heroCardHeaderLeft}>
                <Feather name="database" size={18} color="rgba(255,255,255,0.7)" />
                <Text style={styles.heroCardTitle}>Data Management</Text>
              </View>
            </View>
            <Text style={styles.heroCardSubtitle}>
              Your scan history is stored locally on this device.
            </Text>
            {showDeleteConfirm ? (
              <View style={styles.deleteConfirmBox}>
                <Feather name="alert-triangle" size={18} color="#EF4444" />
                <Text style={styles.deleteConfirmText}>
                  This will permanently delete your scan history. Your scan count and subscription will not be affected.
                </Text>
                <View style={styles.deleteConfirmBtns}>
                  <Pressable
                    onPress={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      styles.deleteCancel,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={styles.deleteCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteLocalData}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      styles.deleteAction,
                      { opacity: pressed || isDeleting ? 0.7 : 1 },
                    ]}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.deleteActionText}>Delete</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowDeleteConfirm(true);
                }}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Feather name="trash-2" size={18} color="#FCA5A5" />
                <Text style={styles.deleteBtnText}>Delete Local Data</Text>
              </Pressable>
            )}
          </View>
        </LinearGradient>

        <View style={styles.lightSection}>
          <View style={styles.aboutCard}>
            <Pressable
              onPress={() => setSupportExpanded(!supportExpanded)}
              style={styles.aboutHeaderBtn}
            >
              <View style={styles.aboutHeaderLeft}>
                <Feather name="life-buoy" size={18} color={theme.colors.primary} />
                <Text style={styles.aboutTitle}>Support</Text>
              </View>
              <Feather
                name={supportExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color="#9CA3AF"
              />
            </Pressable>

            {supportExpanded ? (
              <View style={styles.aboutContent}>
                <MenuItem
                  label="Email Support"
                  rightText="pricerpocket@gmail.com"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL("mailto:pricerpocket@gmail.com");
                  }}
                />
                <MenuItem
                  label="Replay Tutorial"
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    await resetOnboarding();
                    triggerOnboardingReplay();
                  }}
                  showChevron
                />
              </View>
            ) : null}
          </View>

          <View style={styles.aboutCard}>
            <Pressable
              onPress={() => setAboutExpanded(!aboutExpanded)}
              style={styles.aboutHeaderBtn}
            >
              <View style={styles.aboutHeaderLeft}>
                <Feather name="info" size={18} color={theme.colors.primary} />
                <Text style={styles.aboutTitle}>About</Text>
              </View>
              <Feather
                name={aboutExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color="#9CA3AF"
              />
            </Pressable>

            {aboutExpanded ? (
              <View style={styles.aboutContent}>
                <MenuItem
                  label="Privacy Policy"
                  onPress={handleOpenPrivacyPolicy}
                  showChevron
                />
                <MenuItem
                  label="Terms of Service"
                  onPress={handleOpenTermsOfService}
                  showChevron
                />
                <MenuItem
                  label="Website"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    WebBrowser.openBrowserAsync("https://pocket-pricer.com");
                  }}
                  showChevron
                />
              </View>
            ) : null}
          </View>

          <View style={styles.aboutCard}>
            <Pressable
              onPress={() => setRateExpanded(!rateExpanded)}
              style={styles.aboutHeaderBtn}
            >
              <View style={styles.aboutHeaderLeft}>
                <Feather name="star" size={18} color="#D4A926" />
                <Text style={styles.aboutTitle}>Rate & Review</Text>
              </View>
              <Feather
                name={rateExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color="#9CA3AF"
              />
            </Pressable>

            {rateExpanded ? (
              <View style={styles.aboutContent}>
                <MenuItem
                  label="Leave a Review"
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      if (await StoreReview.hasAction()) {
                        await StoreReview.requestReview();
                      }
                    } catch {}
                  }}
                  showChevron
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.versionText}>
            Version {Constants.expoConfig?.version ?? "1.5.0"}
          </Text>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

function MenuItem({
  label,
  rightText,
  onPress,
  showChevron,
}: {
  label: string;
  rightText?: string;
  onPress: () => void;
  showChevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      {rightText ? (
        <Text style={styles.menuRight}>{rightText}</Text>
      ) : showChevron ? (
        <Feather name="chevron-right" size={18} color="#9CA3AF" />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  topOverscrollFill: {
    height: 800,
    marginTop: -800,
    backgroundColor: "#0A3622",
  },
  scrollView: {
    flex: 1,
  },
  heroGradient: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heroCardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroCardSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 14,
    lineHeight: 20,
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#3D2E00",
  },
  freeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  freeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  heroOutlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  heroOutlineBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  goldCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    backgroundColor: "#F0D264",
  },
  goldCtaText: {
    color: "#3D2E00",
    fontSize: 16,
    fontWeight: "700",
  },
  restoreBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 4,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(255,255,255,0.45)",
  },
  heroLegalText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 10,
    color: "rgba(255,255,255,0.3)",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: "rgba(248,113,113,0.7)",
    backgroundColor: "rgba(239,68,68,0.12)",
    gap: 10,
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FCA5A5",
  },
  deleteConfirmBox: {
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    padding: 14,
    gap: 10,
  },
  deleteConfirmText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
  },
  deleteConfirmBtns: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  deleteCancel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  deleteCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deleteAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#EF4444",
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  lightSection: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingTop: 20,
    flexGrow: 1,
    paddingBottom: 40,
  },
  aboutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "rgba(4,120,87,0.2)",
  },
  aboutHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  aboutHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aboutContent: {
    marginTop: 4,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F3F4F6",
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  menuRight: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  versionText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 20,
  },
});
