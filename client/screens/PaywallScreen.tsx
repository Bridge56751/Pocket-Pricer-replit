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
  {
    icon: "camera" as const,
    title: "Unlimited scans",
    desc: "No daily limits, scan as much as you want",
  },
  {
    icon: "trending-up" as const,
    title: "Real sold prices",
    desc: "See what items actually sell for, not just listings",
  },
  {
    icon: "bar-chart-2" as const,
    title: "Buy Score",
    desc: "Instant demand & profit rating per item",
  },
  {
    icon: "dollar-sign" as const,
    title: "Profit calculator",
    desc: "Fees, shipping & net profit at a glance",
  },
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <LinearGradient
          colors={["#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroSection, { paddingTop: insets.top + 12 }]}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
            hitSlop={12}
          >
            <View style={styles.closeCircle}>
              <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
            </View>
          </Pressable>

          <Animated.View entering={FadeInUp.delay(60).duration(480)} style={styles.heroContent}>
            <View style={styles.iconWrap}>
              <View style={styles.iconGlow} />
              <LinearGradient
                colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <View style={styles.iconInner}>
                  <Feather name="tag" size={32} color="#000000" />
                </View>
              </LinearGradient>
            </View>

            <LinearGradient
              colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.proBadge}
            >
              <Feather name="tag" size={12} color="#3D2E00" />
              <Text style={styles.proBadgeText}>POCKET PRICER PRO</Text>
            </LinearGradient>

            {context === "ebay" ? (
              <Text style={styles.heroTitle}>
                See what items{"\n"}actually sell for
              </Text>
            ) : (
              <Text style={styles.heroTitle}>
                Know exactly what{"\n"}to buy & sell
              </Text>
            )}

            <Text style={styles.heroSubtitle}>
              Real sold prices, unlimited scans,{"\n"}and instant profit data.
            </Text>
          </Animated.View>
        </LinearGradient>

        <View style={styles.contentSection}>
          <View style={styles.featuresList}>
            {FEATURES.map((f, index) => (
              <Animated.View
                key={f.title}
                entering={FadeInUp.delay(120 + index * 60).duration(400)}
              >
                <View style={styles.featureRow}>
                  <View style={styles.featureIconCircle}>
                    <Feather name={f.icon} size={18} color="#047857" />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                  <View style={styles.featureCheck}>
                    <Feather name="check" size={14} color="#fff" />
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          <View style={styles.planCards}>
            {showError ? (
              <View style={styles.errorCard}>
                <Feather name="wifi-off" size={22} color="#EF4444" />
                <Text style={styles.errorTitle}>Unable to load plans</Text>
                <Text style={styles.errorSub}>Check your connection and try again.</Text>
                <Pressable onPress={handleRetry} style={styles.retryButton}>
                  <Feather name="refresh-cw" size={14} color="#047857" />
                  <Text style={styles.retryText}>Try Again</Text>
                </Pressable>
              </View>
            ) : packagesLoading ? (
              <View style={styles.planCardsRow}>
                <View style={[styles.planCardSide, styles.skeletonCard]} />
                <View style={[styles.planCardSide, styles.skeletonCard]} />
              </View>
            ) : hasMultiplePlans ? (
              <View style={styles.planCardsRow}>
                <Pressable
                  onPress={() => handleSelectPlan("monthly")}
                  style={[
                    styles.planCardSide,
                    {
                      backgroundColor: selectedPlan === "monthly" ? "#F0FDF8" : "#F9FAFB",
                      borderColor: selectedPlan === "monthly" ? "#047857" : "#E5E7EB",
                    },
                  ]}
                >
                  {(() => {
                    const weeklyPrice = weeklyPkg!.product.price;
                    const monthlyPrice = monthlyPkg!.product.price;
                    const weeklyEquiv = weeklyPrice * 4.33;
                    const savePct = Math.round(((weeklyEquiv - monthlyPrice) / weeklyEquiv) * 100);
                    return savePct > 0 ? (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveBadgeText}>SAVE {savePct}%</Text>
                      </View>
                    ) : null;
                  })()}
                  <Text style={styles.planCardLabel}>Monthly</Text>
                  <Text style={styles.planCardPrice}>{monthlyPkg!.product.priceString}/mo</Text>
                  {selectedPlan === "monthly" ? (
                    <View style={styles.planRadioFilled}>
                      <View style={styles.planRadioInner} />
                    </View>
                  ) : (
                    <View style={styles.planRadioEmpty} />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => handleSelectPlan("weekly")}
                  style={[
                    styles.planCardSide,
                    {
                      backgroundColor: selectedPlan === "weekly" ? "#065F46" : "#14532D",
                      borderColor: selectedPlan === "weekly" ? "#34D399" : "#1A6B3C",
                    },
                  ]}
                >
                  <Text style={[styles.planCardLabel, { color: "rgba(255,255,255,0.7)" }]}>Weekly</Text>
                  <Text style={[styles.planCardPrice, { color: "#FFFFFF" }]}>{weeklyPkg!.product.priceString}/wk</Text>
                  {selectedPlan === "weekly" ? (
                    <View style={[styles.planRadioFilled, { borderColor: "#34D399" }]}>
                      <View style={[styles.planRadioInner, { backgroundColor: "#34D399" }]} />
                    </View>
                  ) : (
                    <View style={[styles.planRadioEmpty, { borderColor: "rgba(255,255,255,0.3)" }]} />
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={[styles.planCardSide, { borderColor: "#047857", backgroundColor: "#F0FDF8", flex: 1 }]}>
                <Text style={styles.planCardLabel}>3-Day Free Trial</Text>
                <Text style={styles.planCardPrice}>{getSelectedPrice()}/{getSelectedPeriod()}</Text>
                <View style={styles.planRadioFilled}>
                  <View style={styles.planRadioInner} />
                </View>
              </View>
            )}
          </View>

          <Animated.View entering={FadeInDown.delay(300).duration(480)} style={styles.ctaWrap}>
            <Pressable
              onPress={handleStartTrial}
              disabled={isLoading || isRestoring || packagesLoading}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, width: "100%" }]}
            >
              <LinearGradient
                colors={["#0A3622", "#14532D", "#065F46"]}
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
              <Feather name="lock" size={12} color="#9CA3AF" />
              <Text style={styles.ctaNote}>
                No charge for 3 days · Cancel anytime
              </Text>
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <Pressable onPress={handleRestore} disabled={isLoading || isRestoring}>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#047857" />
              ) : (
                <Text style={styles.footerLink}>Restore Purchase</Text>
              )}
            </Pressable>
            <Text style={styles.footerDot}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.footerLink}>Terms</Text>
            </Pressable>
            <Text style={styles.footerDot}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.footerLink}>Privacy</Text>
            </Pressable>
          </View>

          <Text style={styles.legalText}>
            After your 3-day free trial, your subscription automatically renews at {getSelectedPrice()}/{getSelectedPeriod()}.
            Payment will be charged to your Apple ID account at confirmation of purchase. Subscription
            automatically renews unless canceled at least 24 hours before the end of the current period.
            Manage or cancel in Settings → Apple ID → Subscriptions.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
  },
  heroSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute" as const,
    right: 16,
    top: 12,
    zIndex: 10,
  },
  closeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: {
    alignItems: "center",
    marginTop: 32,
  },
  iconWrap: {
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(212, 169, 38, 0.15)",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0F2B1A",
    alignItems: "center",
    justifyContent: "center",
  },
  proBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  proBadgeText: {
    fontSize: 13,
    fontWeight: "800" as const,
    color: "#3D2E00",
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    textAlign: "center" as const,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 15,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center" as const,
    lineHeight: 22,
  },
  contentSection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
  },
  featuresList: {
    gap: 4,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  featureIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F0FDF8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#111827",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    color: "#9CA3AF",
    lineHeight: 18,
  },
  featureCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  planCards: {
    marginBottom: 20,
  },
  planCardsRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  planCardSide: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center" as const,
  },
  planCardLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#6B7280",
    marginBottom: 4,
  },
  planCardPrice: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#111827",
    marginBottom: 10,
  },
  planRadioFilled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
  },
  planRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#047857",
  },
  planRadioEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  saveBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: "center" as const,
    marginBottom: 4,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: "800" as const,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  skeletonCard: {
    height: 100,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F3F4F6",
  },
  errorCard: {
    width: "100%" as const,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: "center" as const,
    gap: 8,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
    marginTop: 2,
  },
  errorSub: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center" as const,
  },
  retryButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 6,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#047857",
    backgroundColor: "#FFF",
  },
  retryText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  ctaWrap: {
    width: "100%" as const,
    alignItems: "center" as const,
    marginBottom: 20,
  },
  ctaButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 19,
    borderRadius: 16,
    gap: 10,
    width: "100%" as const,
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800" as const,
    letterSpacing: 0.2,
  },
  ctaNoteRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 5,
    marginTop: 10,
  },
  ctaNote: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginBottom: 16,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: "#6B7280",
  },
  footerDot: {
    fontSize: 13,
    color: "#6B7280",
  },
  legalText: {
    fontSize: 11,
    textAlign: "center" as const,
    lineHeight: 16,
    paddingHorizontal: 4,
    color: "#9CA3AF",
  },
});
