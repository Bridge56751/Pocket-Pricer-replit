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
  { icon: "camera" as const,      text: "Unlimited product scans",                       color: "#047857" },
  { icon: "trending-up" as const, text: "Sold prices — see what items actually sell for", color: "#047857" },
  { icon: "bar-chart-2" as const, text: "Buy Score — instant demand & profit rating",     color: "#047857" },
  { icon: "dollar-sign" as const, text: "Unlimited price comparisons",                    color: "#047857" },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Paywall">>();
  const context = route.params?.context;
  const { packages, purchasePackage, restorePurchases, reloadOfferings, isPro, isReady: rcReady } = useRevenueCat();

  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [offeringsTimedOut, setOfferingsTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const packagesLoading = !rcReady || (rcReady && packages.length === 0);
  const showError = offeringsTimedOut && packagesLoading;

  useEffect(() => {
    if (packages.length > 0) {
      setOfferingsTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }
    timeoutRef.current = setTimeout(() => setOfferingsTimedOut(true), 12000);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [packages.length]);

  const handleRetry = async () => {
    setOfferingsTimedOut(false);
    timeoutRef.current = setTimeout(() => setOfferingsTimedOut(true), 12000);
    await reloadOfferings();
  };
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
        try {
          const revenueValue = activePkg?.product.price ?? 8.99;
          const currencyCode = activePkg?.product.currencyCode ?? "USD";
          const appsFlyer = await import("react-native-appsflyer");
          appsFlyer.default.logEvent("af_start_trial", {
            af_revenue: revenueValue,
            af_currency: currencyCode,
            af_order_id: `trial_${Date.now()}`,
          });
        } catch (e) {}
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

  const cardColor = "#FFFFFF";
  const planCardBg = "#F0FDF8";

  return (
    <LinearGradient
      colors={["#F0FDF8", "#FFFFFF", "#F0FDF8"]}
      style={styles.container}
    >
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.closeButton, { top: insets.top + 12 }]}
        hitSlop={12}
      >
        <View style={[styles.closeCircle, { backgroundColor: "rgba(0,0,0,0.06)" }]}>
          <Feather name="x" size={18} color="#6B7280" />
        </View>
      </Pressable>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
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
            <View style={styles.iconGlow} />
            <LinearGradient
              colors={["#059669", "#047857", "#065F46"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Feather name="tag" size={36} color="#fff" />
            </LinearGradient>
          </View>

          {/* Contextual banner */}
          {context === "ebay" && (
            <View style={styles.contextBanner}>
              <Feather name="trending-up" size={14} color="#047857" />
              <Text style={styles.contextBannerText}>
                Sold price data is a Pro feature
              </Text>
            </View>
          )}

          {/* Title & subtitle */}
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            {context === "ebay"
              ? "See what items actually sell for"
              : "Know exactly what to buy & sell"}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            Real sold prices, unlimited scans, and instant profit data — everything you need to win as a reseller.
          </Text>

          {/* Features */}
          <View style={styles.featuresList}>
            {FEATURES.map((f) => (
              <View
                key={f.text}
                style={[
                  styles.featureRow,
                  {
                    backgroundColor: "rgba(0,0,0,0.02)",
                    borderColor: "rgba(4,120,87,0.25)",
                  },
                ]}
              >
                <View style={[styles.featureIconCircle, { backgroundColor: "#04785722" }]}>
                  <Feather name={f.icon} size={16} color={f.color} />
                </View>
                <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                  {f.text}
                </Text>
                <Feather name="check" size={16} color="#047857" />
              </View>
            ))}
          </View>

          {/* Plan cards */}
          <View style={styles.planCards}>
            {showError ? (
              <View style={[styles.errorCard, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Feather name="wifi-off" size={22} color="#EF4444" />
                <Text style={[styles.errorTitle, { color: theme.colors.foreground }]}>Unable to load plans</Text>
                <Text style={[styles.errorSub, { color: theme.colors.mutedForeground }]}>Check your connection and try again.</Text>
                <Pressable
                  onPress={handleRetry}
                  style={[styles.retryButton, { backgroundColor: "#FFF" }]}
                >
                  <Feather name="refresh-cw" size={14} color="#047857" />
                  <Text style={styles.retryText}>Try Again</Text>
                </Pressable>
              </View>
            ) : packagesLoading ? (
              <View style={[styles.planCard, styles.skeletonCard, { borderColor: "#E5E7EB", backgroundColor: "#F3F4F6" }]} />
            ) : hasMultiplePlans ? (
              <>
                <Pressable
                  onPress={() => handleSelectPlan("weekly")}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: selectedPlan === "weekly" ? planCardBg : "#F9FAFB",
                      borderColor: selectedPlan === "weekly" ? "#047857" : "#E5E7EB",
                    },
                  ]}
                >
                  <View style={styles.planLeft}>
                    <Text style={[styles.planName, { color: theme.colors.foreground }]}>Weekly</Text>
                    <Text style={[styles.planTrialText, { color: "#047857" }]}>
                      3-day free trial
                    </Text>
                    <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                      then {weeklyPkg!.product.priceString}/week
                    </Text>
                  </View>
                  <View style={styles.planCheck}>
                    {selectedPlan === "weekly" ? (
                      <View style={styles.checkFilled}>
                        <Feather name="check" size={14} color="#fff" />
                      </View>
                    ) : (
                      <View style={[styles.radioOuter, { borderColor: "#D1D5DB" }]} />
                    )}
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => handleSelectPlan("monthly")}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: selectedPlan === "monthly" ? planCardBg : "#F9FAFB",
                      borderColor: selectedPlan === "monthly" ? "#047857" : "#E5E7EB",
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
                    <Text style={[styles.planTrialText, { color: "#047857" }]}>
                      3-day free trial
                    </Text>
                    <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                      then {monthlyPkg!.product.priceString}/month
                    </Text>
                  </View>
                  <View style={styles.planCheck}>
                    {selectedPlan === "monthly" ? (
                      <View style={styles.checkFilled}>
                        <Feather name="check" size={14} color="#fff" />
                      </View>
                    ) : (
                      <View style={[styles.radioOuter, { borderColor: "#D1D5DB" }]} />
                    )}
                  </View>
                </Pressable>
              </>
            ) : (
              <View style={[styles.planCard, { backgroundColor: planCardBg, borderColor: "#047857" }]}>
                <View style={styles.planLeft}>
                  <Text style={[styles.planTrialText, { color: "#047857", fontSize: 16 }]}>
                    3-Day Free Trial
                  </Text>
                  <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                    then {getSelectedPrice()}/{getSelectedPeriod()}
                  </Text>
                </View>
                <View style={styles.checkFilled}>
                  <Feather name="check" size={14} color="#fff" />
                </View>
              </View>
            )}
          </View>

          {/* CTA */}
          <Animated.View entering={FadeInDown.delay(300).duration(480)} style={styles.ctaWrap}>
            <Pressable
              onPress={handleStartTrial}
              disabled={isLoading || isRestoring || packagesLoading}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, width: "100%" }]}
            >
              <LinearGradient
                colors={["#059669", "#047857", "#065F46"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.ctaButton, packagesLoading && { opacity: 0.75 }]}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : packagesLoading && !showError ? (
                  <>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.ctaButtonText}>Loading plans...</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.ctaButtonText}>Start 3-Day Free Trial</Text>
                    <Feather name="arrow-right" size={20} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <View style={styles.ctaNoteRow}>
              <Feather name="lock" size={12} color={theme.colors.mutedForeground} />
              <Text style={[styles.ctaNote, { color: theme.colors.mutedForeground }]}>
                No charge for 3 days. Cancel anytime.
              </Text>
            </View>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable onPress={handleRestore} disabled={isLoading || isRestoring}>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#047857" />
              ) : (
                <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                  Restore Purchase
                </Text>
              )}
            </Pressable>
            <Text style={[styles.footerDot, { color: theme.colors.mutedForeground }]}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                Terms
              </Text>
            </Pressable>
            <Text style={[styles.footerDot, { color: theme.colors.mutedForeground }]}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                Privacy
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
    </LinearGradient>
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
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  iconWrap: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(4, 120, 87, 0.15)",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  contextBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(4, 120, 87, 0.12)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(4, 120, 87, 0.25)",
  },
  contextBannerText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 4,
  },
  featuresList: {
    width: "100%",
    gap: 10,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  featureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
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
    paddingVertical: 14,
  },
  skeletonCard: {
    height: 72,
    borderWidth: 1,
  },
  errorCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  errorSub: {
    fontSize: 13,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#047857",
  },
  retryText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
  },
  planLeft: {
    flex: 1,
  },
  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  planName: {
    fontSize: 17,
    fontWeight: "700",
  },
  planTrialText: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  bestValueBadge: {
    backgroundColor: "#047857",
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
    fontSize: 13,
  },
  planCheck: {
    marginLeft: 12,
  },
  checkFilled: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
  },
  ctaWrap: {
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 19,
    borderRadius: 16,
    gap: 10,
    width: "100%",
    shadowColor: "#047857",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  ctaNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
  },
  ctaNote: {
    fontSize: 13,
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
