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
    desc: "No daily cap — scan as much as you want",
  },
  {
    icon: "trending-up" as const,
    title: "Real sold prices",
    desc: "What buyers actually paid, not asking prices",
    badge: "Most valuable",
    badgeColor: "#047857",
  },
  {
    icon: "bar-chart-2" as const,
    title: "Buy Score & Profit Calculator",
    desc: "0–100 rating + fees, shipping & net profit",
    badge: "New",
    badgeColor: "#047857",
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Paywall">>();
  const context = route.params?.context;
  const { packages, purchasePackage, restorePurchases, reloadOfferings, isPro, isReady: rcReady, customerInfo } = useRevenueCat();

  const currentPlanType = (() => {
    if (!isPro || !customerInfo) return null;
    const subs = customerInfo.activeSubscriptions ?? [];
    const subStr = subs.join(" ").toLowerCase();
    if (subStr.includes("weekly") || subStr.includes("week")) return "weekly";
    if (subStr.includes("yearly") || subStr.includes("year") || subStr.includes("annual")) return "yearly";
    if (subStr.includes("monthly") || subStr.includes("month")) return "monthly";
    return "monthly";
  })();

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
  const yearlyPkg = packages.find(
    (pkg) => pkg.packageType === "ANNUAL" || pkg.identifier === "$rc_annual"
  );
  const hasMultiplePlans = [weeklyPkg, monthlyPkg, yearlyPkg].filter(Boolean).length > 1;
  const [selectedPlan, setSelectedPlan] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const userHasChosen = useRef(false);

  useEffect(() => {
    if (userHasChosen.current) return;
    if (monthlyPkg) setSelectedPlan("monthly");
    else if (weeklyPkg) setSelectedPlan("weekly");
    else if (yearlyPkg) setSelectedPlan("yearly");
  }, [weeklyPkg, monthlyPkg, yearlyPkg]);

  const handleSelectPlan = (plan: "weekly" | "monthly" | "yearly") => {
    userHasChosen.current = true;
    setSelectedPlan(plan);
  };

  const activePkg =
    selectedPlan === "weekly" && weeklyPkg
      ? weeklyPkg
      : selectedPlan === "yearly" && yearlyPkg
        ? yearlyPkg
        : monthlyPkg || weeklyPkg || yearlyPkg || packages[0];

  const getSelectedPrice = () => activePkg?.product.priceString ?? "$8.99";
  const getSelectedPeriod = () => {
    if (!activePkg) return "month";
    if (activePkg === weeklyPkg) return "week";
    if (activePkg === yearlyPkg) return "year";
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
                <Feather name="tag" size={32} color="#000000" style={{ transform: [{ scaleX: -1 }] }} />
              </LinearGradient>
            </View>

            <LinearGradient
              colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.proBadge}
            >
              <Feather name="tag" size={12} color="#3D2E00" style={{ transform: [{ scaleX: -1 }] }} />
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
                <View style={styles.featureCard}>
                  <View style={styles.featureIconCircle}>
                    <Feather name={f.icon} size={20} color="#047857" />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                    {"badge" in f && f.badge ? (
                      <View style={[styles.featureBadge, { backgroundColor: f.badgeColor + "15" }]}>
                        <Text style={[styles.featureBadgeText, { color: f.badgeColor }]}>{f.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.featureCheck}>
                    <Feather name="check" size={15} color="#fff" />
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>

          <Text style={styles.planSectionTitle}>CHOOSE YOUR PLAN</Text>

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
              <View style={styles.planStackCol}>
                <View style={[styles.planRowCard, styles.skeletonCard]} />
                <View style={[styles.planRowCard, styles.skeletonCard]} />
              </View>
            ) : hasMultiplePlans ? (
              <View style={styles.planStackCol}>
                {weeklyPkg ? (
                  <Pressable
                    onPress={() => handleSelectPlan("weekly")}
                    style={[
                      styles.planRowCard,
                      {
                        borderColor: selectedPlan === "weekly" ? "#047857" : "#E5E7EB",
                        backgroundColor: selectedPlan === "weekly" ? "#F0FDF8" : "#F9FAFB",
                      },
                    ]}
                  >
                    <View style={styles.planRowLeft}>
                      {selectedPlan === "weekly" ? (
                        <View style={styles.planRadioFilled}>
                          <View style={styles.planRadioInner} />
                        </View>
                      ) : (
                        <View style={styles.planRadioEmpty} />
                      )}
                      <View>
                        <Text style={styles.planRowTitle}>Weekly</Text>
                        <Text style={styles.planRowSub}>Flexible, cancel anytime</Text>
                      </View>
                    </View>
                    <View style={styles.planRowRight}>
                      {currentPlanType === "weekly" ? (
                        <View style={styles.currentPlanBadge}>
                          <Text style={styles.currentPlanBadgeText}>Current</Text>
                        </View>
                      ) : null}
                      <Text style={styles.planRowPrice}>{weeklyPkg.product.priceString}</Text>
                      <Text style={styles.planRowPeriod}>per week</Text>
                    </View>
                  </Pressable>
                ) : null}

                {monthlyPkg ? (
                  <View>
                    {weeklyPkg ? (() => {
                      const weeklyMonthly = weeklyPkg.product.price * 4.33;
                      const monthlyPrice = monthlyPkg.product.price;
                      const savePct = Math.round(((weeklyMonthly - monthlyPrice) / weeklyMonthly) * 100);
                      return savePct > 0 ? (
                        <View style={styles.saveBadgeFloatGreen}>
                          <Text style={styles.saveBadgeFloatText}>Save {savePct}%</Text>
                        </View>
                      ) : null;
                    })() : null}
                    <Pressable
                      onPress={() => handleSelectPlan("monthly")}
                      style={[
                        styles.planRowCard,
                        {
                          borderColor: selectedPlan === "monthly" ? "#047857" : "#047857",
                          borderWidth: 2,
                          backgroundColor: selectedPlan === "monthly" ? "#F0FDF8" : "#FFFFFF",
                        },
                      ]}
                    >
                      <View style={styles.planRowLeft}>
                        {selectedPlan === "monthly" ? (
                          <View style={styles.planRadioFilled}>
                            <View style={styles.planRadioInner} />
                          </View>
                        ) : (
                          <View style={styles.planRadioEmpty} />
                        )}
                        <View>
                          <Text style={styles.planRowTitle}>Monthly</Text>
                          {weeklyPkg ? (
                            <Text style={styles.planRowSub}>
                              ~${(monthlyPkg.product.price / 4.33).toFixed(2)}/wk · vs weekly
                            </Text>
                          ) : (
                            <Text style={styles.planRowSub}>Most flexible option</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.planRowRight}>
                        {currentPlanType === "monthly" ? (
                          <View style={styles.currentPlanBadge}>
                            <Text style={styles.currentPlanBadgeText}>Current</Text>
                          </View>
                        ) : null}
                        <Text style={styles.planRowPrice}>{monthlyPkg.product.priceString}</Text>
                        <Text style={styles.planRowPeriod}>per month</Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}

                {yearlyPkg ? (
                  <View>
                    <View style={styles.yearlyBadgeRow}>
                      <View style={styles.bestValueBadge}>
                        <Text style={styles.bestValueText}>Best value</Text>
                      </View>
                      {weeklyPkg ? (() => {
                        const weeklyAnnual = weeklyPkg.product.price * 52;
                        const yearlyPrice = yearlyPkg.product.price;
                        const savePct = Math.round(((weeklyAnnual - yearlyPrice) / weeklyAnnual) * 100);
                        return savePct > 0 ? (
                          <View style={styles.saveBadgeFloatGold}>
                            <Text style={styles.saveBadgeFloatTextGold}>Save {savePct}%</Text>
                          </View>
                        ) : null;
                      })() : null}
                    </View>
                    <Pressable
                      onPress={() => handleSelectPlan("yearly")}
                      style={[
                        styles.planRowCard,
                        {
                          borderColor: selectedPlan === "yearly" ? "#C49B1F" : "#D4A926",
                          borderWidth: 2,
                          backgroundColor: selectedPlan === "yearly" ? "#FFFBEB" : "#FFFFFF",
                        },
                      ]}
                    >
                      <View style={styles.planRowLeft}>
                        {selectedPlan === "yearly" ? (
                          <View style={[styles.planRadioFilled, { borderColor: "#C49B1F" }]}>
                            <View style={[styles.planRadioInner, { backgroundColor: "#C49B1F" }]} />
                          </View>
                        ) : (
                          <View style={[styles.planRadioEmpty, { borderColor: "#D4A926" }]} />
                        )}
                        <View>
                          <Text style={styles.planRowTitle}>Yearly</Text>
                          {weeklyPkg ? (
                            <Text style={styles.planRowSub}>
                              ~${(yearlyPkg.product.price / 52).toFixed(2)}/wk · vs weekly
                            </Text>
                          ) : (
                            <Text style={styles.planRowSub}>
                              ${(yearlyPkg.product.price / 12).toFixed(2)} / mo · billed annually
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.planRowRight}>
                        {currentPlanType === "yearly" ? (
                          <View style={styles.currentPlanBadge}>
                            <Text style={styles.currentPlanBadgeText}>Current</Text>
                          </View>
                        ) : null}
                        {weeklyPkg ? (
                          <Text style={styles.planRowStrikePrice}>
                            ${(weeklyPkg.product.price * 52).toFixed(2)}
                          </Text>
                        ) : null}
                        <Text style={styles.planRowPrice}>{yearlyPkg.product.priceString}</Text>
                        <Text style={styles.planRowPeriod}>per year</Text>
                      </View>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <Pressable
                style={[styles.planRowCard, { borderColor: "#047857", backgroundColor: "#F0FDF8" }]}
              >
                <View style={styles.planRowLeft}>
                  <View style={styles.planRadioFilled}>
                    <View style={styles.planRadioInner} />
                  </View>
                  <View>
                    <Text style={styles.planRowTitle}>3-Day Free Trial</Text>
                    <Text style={styles.planRowSub}>Cancel anytime</Text>
                  </View>
                </View>
                <View style={styles.planRowRight}>
                  <Text style={styles.planRowPrice}>{getSelectedPrice()}</Text>
                  <Text style={styles.planRowPeriod}>per {getSelectedPeriod()}</Text>
                </View>
              </Pressable>
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
                    <Text style={styles.ctaButtonText}>{isPro ? "Switch Plan" : "Start 3-Day Free Trial"}</Text>
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
    top: 52,
    zIndex: 10,
    padding: 10,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
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
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -16,
  },
  featuresList: {
    gap: 10,
    marginBottom: 24,
  },
  featureCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  featureIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
    marginBottom: 3,
  },
  featureDesc: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  featureCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  featureBadge: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 5,
  },
  featureBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
  },
  planSectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: "#9CA3AF",
    letterSpacing: 1.5,
    textAlign: "center" as const,
    marginBottom: 14,
  },
  planCards: {
    marginBottom: 20,
  },
  planStackCol: {
    gap: 10,
  },
  planRowCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexWrap: "wrap" as const,
  },
  yearlyBadgeRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: -10,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  planRowLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  planRowRight: {
    alignItems: "flex-end" as const,
  },
  planRowTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#111827",
    marginBottom: 1,
  },
  planRowSub: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  planRowPrice: {
    fontSize: 22,
    fontWeight: "800" as const,
    color: "#111827",
  },
  planRowPeriod: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  currentPlanBadge: {
    backgroundColor: "#047857",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 2,
  },
  currentPlanBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  planRadioFilled: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#047857",
  },
  planRadioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
  planRowStrikePrice: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through" as const,
    marginBottom: 1,
  },
  saveBadgeFloatGreen: {
    alignSelf: "flex-end" as const,
    backgroundColor: "#047857",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: -10,
    marginRight: 4,
    zIndex: 1,
  },
  saveBadgeFloatText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  saveBadgeFloatGold: {
    backgroundColor: "#C49B1F",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  saveBadgeFloatTextGold: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  bestValueBadge: {
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bestValueText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  skeletonCard: {
    height: 60,
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
