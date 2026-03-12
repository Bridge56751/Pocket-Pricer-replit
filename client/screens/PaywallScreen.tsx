import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const PRIVACY_URL = "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const FEATURES = [
  { icon: "camera" as const,      text: "Unlimited product scans",                       color: "#10B981" },
  { icon: "trending-up" as const, text: "Sold prices — see what items actually sell for", color: "#10B981" },
  { icon: "bar-chart-2" as const, text: "Buy Score — instant demand & profit rating",     color: "#10B981" },
  { icon: "dollar-sign" as const, text: "Unlimited price comparisons",                    color: "#10B981" },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDarkMode } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Paywall">>();
  const context = route.params?.context;
  const { packages, purchasePackage, restorePurchases, isPro, isReady: rcReady } = useRevenueCat();

  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const weeklyPkg = packages.find(
    (pkg) => pkg.packageType === "WEEKLY" || pkg.identifier === "$rc_weekly"
  );
  const monthlyPkg = packages.find(
    (pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly"
  );
  const hasMultiplePlans = !!(weeklyPkg && monthlyPkg);
  const [selectedPlan, setSelectedPlan] = useState<"weekly" | "monthly">("weekly");
  const userHasChosen = useRef(false);

  useEffect(() => {
    if (userHasChosen.current) return;
    if (weeklyPkg) setSelectedPlan("weekly");
    else if (monthlyPkg) setSelectedPlan("monthly");
  }, [weeklyPkg, monthlyPkg]);

  const handleSelectPlan = (plan: "weekly" | "monthly") => {
    userHasChosen.current = true;
    setSelectedPlan(plan);
  };

  const activePkg =
    selectedPlan === "weekly" && weeklyPkg
      ? weeklyPkg
      : monthlyPkg || weeklyPkg || packages[0];

  const getSelectedPrice = () => activePkg?.product.priceString ?? "$8.99";
  const getSelectedPeriod = () => {
    if (!activePkg) return "month";
    if (activePkg === weeklyPkg) return "week";
    return "month";
  };

  const navigateHome = () => {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Home" }] }));
  };

  const handleStartTrial = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile Only", "Subscriptions are only available in the mobile app.");
      return;
    }
    if (!activePkg) {
      Alert.alert("Error", "No subscription packages available. Please try again later.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await purchasePackage(activePkg);
      if (result.success) {
        navigateHome();
      } else if (result.error && result.error !== "Purchase cancelled") {
        Alert.alert("Purchase Failed", result.error);
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Purchase failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile Only", "Please use the mobile app to restore purchases.");
      return;
    }
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        navigateHome();
      } else {
        Alert.alert("No Subscription Found", result.error || "No active subscription found.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  useEffect(() => {
    if (isPro) navigateHome();
  }, [isPro]);

  if (isPro) return null;

  const bgColor = isDarkMode ? "#1A1A1A" : "#F2F2F7";
  const cardColor = isDarkMode ? "#2C2C2E" : "#FFFFFF";
  const planCardBg = isDarkMode ? "#1C3A2E" : "#F0FDF8";
  const featureIconBg = isDarkMode ? "#1C3A2E" : "#F0FDF8";

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.closeButton, { top: insets.top + 12 }]}
        hitSlop={12}
      >
        <Feather name="x" size={22} color={isDarkMode ? "#9CA3AF" : "#6B7280"} />
      </Pressable>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          entering={FadeInUp.delay(60).duration(480)}
          style={[styles.card, { backgroundColor: cardColor }]}
        >
          {/* Icon */}
          <View style={styles.iconWrap}>
            <LinearGradient
              colors={["#34D399", "#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Feather name="tag" size={38} color="#fff" />
            </LinearGradient>
          </View>

          {/* Contextual banner */}
          {context === "ebay" && (
            <View style={styles.contextBanner}>
              <Feather name="trending-up" size={14} color="#10B981" />
              <Text style={styles.contextBannerText}>
                eBay sold data is a Pro feature
              </Text>
            </View>
          )}

          {/* Title & subtitle */}
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {context === "ebay"
              ? "See what items actually sell for"
              : "Stop guessing what items sell for"}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            See exactly what your items sell for — unlimited scans, real sold data, instant profit math.
          </Text>

          {/* Features */}
          <View style={styles.featuresList}>
            {FEATURES.map((f) => (
              <View
                key={f.text}
                style={[
                  styles.featureRow,
                  {
                    backgroundColor: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                    borderColor: isDarkMode ? "rgba(16,185,129,0.25)" : "rgba(16,185,129,0.3)",
                  },
                ]}
              >
                <View style={[styles.featureIconCircle, { backgroundColor: f.color + "22" }]}>
                  <Feather name={f.icon} size={17} color={f.color} />
                </View>
                <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                  {f.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Plan cards */}
          <View style={styles.planCards}>
            {hasMultiplePlans ? (
              <>
                <Pressable
                  onPress={() => handleSelectPlan("weekly")}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: selectedPlan === "weekly" ? planCardBg : isDarkMode ? "#2C2C2E" : "#F9FAFB",
                      borderColor: selectedPlan === "weekly" ? "#10B981" : isDarkMode ? "#3A3A3C" : "#E5E7EB",
                    },
                  ]}
                >
                  <View style={styles.planLeft}>
                    <Text style={[styles.planName, { color: theme.colors.foreground }]}>Weekly</Text>
                    <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                      3-day free trial, then {weeklyPkg!.product.priceString}/week
                    </Text>
                  </View>
                  <View style={styles.planCheck}>
                    {selectedPlan === "weekly" ? (
                      <Feather name="check-circle" size={24} color="#10B981" />
                    ) : (
                      <View style={[styles.radioOuter, { borderColor: isDarkMode ? "#3A3A3C" : "#D1D5DB" }]} />
                    )}
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => handleSelectPlan("monthly")}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: selectedPlan === "monthly" ? planCardBg : isDarkMode ? "#2C2C2E" : "#F9FAFB",
                      borderColor: selectedPlan === "monthly" ? "#10B981" : isDarkMode ? "#3A3A3C" : "#E5E7EB",
                    },
                  ]}
                >
                  <View style={styles.planLeft}>
                    <View style={styles.planNameRow}>
                      <Text style={[styles.planName, { color: theme.colors.foreground }]}>Monthly</Text>
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueText}>Best Value</Text>
                      </View>
                    </View>
                    <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                      3-day free trial, then {monthlyPkg!.product.priceString}/month
                    </Text>
                  </View>
                  <View style={styles.planCheck}>
                    {selectedPlan === "monthly" ? (
                      <Feather name="check-circle" size={24} color="#10B981" />
                    ) : (
                      <View style={[styles.radioOuter, { borderColor: isDarkMode ? "#3A3A3C" : "#D1D5DB" }]} />
                    )}
                  </View>
                </Pressable>
              </>
            ) : (
              <View style={[styles.planCard, { backgroundColor: planCardBg, borderColor: "#10B981" }]}>
                <View style={styles.planLeft}>
                  <Text style={[styles.planName, { color: theme.colors.foreground }]}>
                    3-Day Free Trial
                  </Text>
                  <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                    then {getSelectedPrice()}/{getSelectedPeriod()}
                  </Text>
                </View>
                <View style={styles.planCheck}>
                  <Feather name="check-circle" size={24} color="#10B981" />
                </View>
              </View>
            )}
          </View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(300).duration(480)} style={styles.ctaWrap}>
            <Pressable
              onPress={handleStartTrial}
              disabled={isLoading || isRestoring}
              style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1, width: "100%" }]}
            >
              <View style={styles.ctaButtonOuter}>
                <LinearGradient
                  colors={["#34D399", "#10B981", "#059669"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaButtonTop}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.ctaTrialText}>3-Day Free Trial</Text>
                  )}
                </LinearGradient>
                <View style={styles.ctaButtonBottom}>
                  <Text style={styles.ctaPriceText}>
                    Then {getSelectedPrice()}/{getSelectedPeriod()}
                  </Text>
                </View>
              </View>
            </Pressable>

            <Text style={[styles.ctaNote, { color: theme.colors.mutedForeground }]}>
              No charge until trial ends. Cancel anytime.
            </Text>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable onPress={handleRestore} disabled={isLoading || isRestoring}>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                  Restore Purchase
                </Text>
              )}
            </Pressable>
            <Text style={[styles.footerDot, { color: theme.colors.mutedForeground }]}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                Terms of Use
              </Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: theme.colors.mutedForeground }]}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                Privacy Policy
              </Text>
            </Pressable>
          </View>

          {/* Legal disclosure */}
          <Text style={[styles.legalText, { color: theme.colors.mutedForeground }]}>
            After your 3-day free trial, your subscription automatically renews at {getSelectedPrice()}/{getSelectedPeriod()}.
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
            automatically renews unless canceled at least 24 hours before the end of the current period.
            Manage or cancel in Settings → Apple ID → Subscriptions.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 8,
  },
  iconWrap: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  contextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  contextBannerText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  featuresList: {
    width: "100%",
    gap: 14,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  featureIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  planCards: {
    width: "100%",
    gap: 10,
    marginBottom: 24,
  },
  planCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  planLeft: {
    flex: 1,
  },
  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  planName: {
    fontSize: 17,
    fontWeight: "700",
  },
  bestValueBadge: {
    backgroundColor: "#10B981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bestValueText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  planPrice: {
    fontSize: 14,
  },
  planCheck: {
    marginLeft: 12,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  ctaButtonOuter: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaButtonTop: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  ctaTrialText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  ctaButtonBottom: {
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  ctaPriceText: {
    color: "#1A2E23",
    fontSize: 15,
    fontWeight: "600",
  },
  ctaNote: {
    fontSize: 13,
    marginTop: 10,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "500",
  },
  footerDot: {
    fontSize: 13,
  },
  legalText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 4,
  },
});
