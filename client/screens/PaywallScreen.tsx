import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  CommonActions,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import {
  isActiveStoreProduct,
  planDescription,
  planKind,
  planName,
  planPeriod,
  renewalDisclosure,
  type PlanKind,
} from "./paywall-terms";

const PRIVACY_URL =
  "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
const TERMS_URL =
  Platform.OS === "android"
    ? "https://play.google.com/about/play-terms/"
    : "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const BENEFITS = [
  [
    "camera",
    "Expanded product photo scanning",
    "Research more finds with Pocket Pricer Pro access.",
  ],
  [
    "trending-up",
    "Real sold-price comps",
    "See what buyers paid, not optimistic listings.",
  ],
  [
    "bar-chart-2",
    "Buy Score and profit math",
    "Make the call with fees, shipping, and net profit.",
  ],
  [
    "package",
    "Inventory that stays current",
    "Track buys, sold items, and every margin.",
  ],
] as const;

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Paywall">>();
  const context = route.params?.context;
  const {
    packages,
    purchasePackage,
    restorePurchases,
    reloadOfferings,
    isPro,
    isReady: rcReady,
    customerInfo,
    offeringsDebug,
  } = useRevenueCat();
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [offeringsTimedOut, setOfferingsTimedOut] = useState(false);
  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(
    null,
  );
  const chosenRef = useRef(false);
  const wasProOnMount = useRef(isPro);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const packagesLoading = !rcReady || packages.length === 0;
  const showError = offeringsTimedOut && packagesLoading;
  const isExpoGoUnavailable = offeringsDebug.includes("Expo Go");
  const orderedPackages = [...packages].sort((a, b) => {
    const order: Record<PlanKind, number> = {
      weekly: 0,
      monthly: 1,
      multiMonth: 2,
      yearly: 3,
      lifetime: 4,
      other: 5,
    };
    return order[planKind(a)] - order[planKind(b)];
  });
  const activeSubscriptionIds = new Set(
    customerInfo?.activeSubscriptions ?? [],
  );
  const currentPackage = packages.find((pkg) =>
    isActiveStoreProduct(pkg, activeSubscriptionIds),
  );
  const defaultPkg =
    currentPackage ??
    packages.find((pkg) => planKind(pkg) === "monthly") ??
    packages.find((pkg) => planKind(pkg) === "yearly") ??
    packages.find((pkg) => planKind(pkg) === "weekly") ??
    orderedPackages[0];
  const activePkg =
    packages.find((pkg) => pkg.identifier === selectedIdentifier) ?? defaultPkg;
  const activeIsCurrent = Boolean(
    activePkg && isActiveStoreProduct(activePkg, activeSubscriptionIds),
  );
  const monthlyPkg = packages.find((pkg) => planKind(pkg) === "monthly");
  const yearlyPkg = packages.find((pkg) => planKind(pkg) === "yearly");

  const annualSaving = (() => {
    if (!monthlyPkg || !yearlyPkg || monthlyPkg.product.price <= 0) return null;
    const value = Math.round(
      (1 - yearlyPkg.product.price / (monthlyPkg.product.price * 12)) * 100,
    );
    return Number.isFinite(value) && value > 0 ? value : null;
  })();

  useEffect(() => {
    if (packages.length > 0) {
      setOfferingsTimedOut(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }
    timeoutRef.current = setTimeout(() => setOfferingsTimedOut(true), 12000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [packages.length]);

  useEffect(() => {
    if (!chosenRef.current && defaultPkg) {
      setSelectedIdentifier(defaultPkg.identifier);
    }
  }, [defaultPkg]);

  const navigateHome = useCallback(
    () =>
      navigation.dispatch(
        CommonActions.reset({ index: 0, routes: [{ name: "MainTabs" }] }),
      ),
    [navigation],
  );

  useEffect(() => {
    if (isPro && !wasProOnMount.current) navigateHome();
  }, [isPro, navigateHome]);

  const handleRetry = async () => {
    setOfferingsTimedOut(false);
    timeoutRef.current = setTimeout(() => setOfferingsTimedOut(true), 12000);
    await reloadOfferings();
  };

  const handlePurchase = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Mobile Only",
        "Subscriptions are available in the Pocket Pricer mobile app.",
      );
      return;
    }
    if (!activePkg) {
      Alert.alert(
        "Plans unavailable",
        "We could not load a plan. Please try again.",
      );
      return;
    }
    if (activeIsCurrent) return;
    setIsLoading(true);
    try {
      const result = await purchasePackage(activePkg);
      if (result.success) {
        try {
          const appsFlyer = await import("react-native-appsflyer");
          appsFlyer.default.logEvent("af_start_trial", {
            af_revenue: activePkg.product.price,
            af_currency: activePkg.product.currencyCode,
            af_order_id: `subscription_${Date.now()}`,
          });
        } catch {}
        navigateHome();
      } else if (result.error && result.error !== "Purchase cancelled")
        Alert.alert("Purchase Failed", result.error);
    } catch (error: any) {
      Alert.alert("Purchase Failed", error?.message || "Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Mobile Only",
        "Please use the Pocket Pricer mobile app to restore purchases.",
      );
      return;
    }
    setIsRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) navigateHome();
      else
        Alert.alert(
          "No Subscription Found",
          result.error || "No active subscription found.",
        );
    } catch (error: any) {
      Alert.alert("Restore Failed", error?.message || "Please try again.");
    } finally {
      setIsRestoring(false);
    }
  };

  const headline = isPro
    ? "Your edge,\non your terms."
    : context === "inventory"
      ? "Make every\nflip count."
      : context === "ebay"
        ? "Price with\nproof."
        : "Know the\nnumber.";
  const selectedPrice = activePkg?.product.priceString;
  const selectedRenewalDisclosure = renewalDisclosure(activePkg, Platform.OS);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.top,
            compact && styles.topCompact,
            { paddingTop: insets.top + 8 },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close subscription options"
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.close}
          >
            <Feather name="x" size={23} color="#073D2A" />
          </Pressable>
          <Text style={styles.brand}>
            POCKET PRICER <Text style={styles.brandGold}>PRO</Text>
          </Text>
          <Animated.View
            entering={FadeInUp.duration(430)}
            style={[styles.hero, compact && styles.heroCompact]}
          >
            <Text style={styles.kicker}>
              {isPro ? "MEMBERSHIP OPTIONS" : "THE RESELLER'S ADVANTAGE"}
            </Text>
            <Text style={[styles.headline, compact && styles.headlineCompact]}>
              {headline}
            </Text>
            <Text style={styles.subhead}>
              {isPro
                ? "Choose the plan that fits how you source."
                : "The fast read on value, profit, and what to buy next."}
            </Text>
          </Animated.View>
          <View
            style={[styles.tagArtwork, compact && styles.tagArtworkCompact]}
            pointerEvents="none"
          >
            <View style={styles.tagHole} />
            <Feather name="dollar-sign" size={55} color="#F7E6A6" />
          </View>
          <View style={styles.sparkOne} />
          <View style={styles.sparkTwo} />
        </View>

        <Animated.View
          entering={FadeInUp.delay(100).duration(450)}
          style={styles.valueCard}
        >
          <View style={styles.valueHeader}>
            <View style={styles.valueIcon}>
              <Feather name="award" size={17} color="#F5D66E" />
            </View>
            <Text style={styles.valueTitle}>The pocket advantage</Text>
          </View>
          {BENEFITS.map(([icon, title, detail]) => (
            <View style={styles.benefit} key={title}>
              <View style={styles.check}>
                <Feather name="check" size={13} color="#06452F" />
              </View>
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>{title}</Text>
                <Text style={styles.benefitDetail}>{detail}</Text>
              </View>
            </View>
          ))}
          <View style={styles.chartBars}>
            <View style={[styles.bar, { height: 16 }]} />
            <View style={[styles.bar, { height: 30 }]} />
            <View style={[styles.bar, { height: 45 }]} />
          </View>
        </Animated.View>

        <View style={styles.plansArea}>
          <Text style={styles.sectionLabel}>
            {isPro ? "UPDATE YOUR PLAN" : "CHOOSE YOUR PLAN"}
          </Text>
          {showError || isExpoGoUnavailable ? (
            <View style={styles.statusCard}>
              <Feather
                name={isExpoGoUnavailable ? "smartphone" : "wifi-off"}
                size={22}
                color="#B84D37"
              />
              <Text style={styles.statusTitle}>
                {isExpoGoUnavailable
                  ? "Open a test build to view plans"
                  : "Plans could not load"}
              </Text>
              <Text style={styles.statusText}>
                {isExpoGoUnavailable
                  ? "RevenueCat pricing and checkout are unavailable inside Expo Go. Use TestFlight or a development build."
                  : "Check your connection and try again."}
              </Text>
              {!isExpoGoUnavailable ? (
                <Pressable onPress={handleRetry} style={styles.retry}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : packagesLoading ? (
            <View style={styles.skeletonWrap}>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </View>
          ) : (
            <View
              style={styles.planList}
              accessibilityRole="radiogroup"
              accessibilityLabel="Subscription plans. Select one plan."
            >
              {orderedPackages.map((pkg, index) => {
                const kind = planKind(pkg);
                const period = planPeriod(pkg, kind);
                const selected = activePkg?.identifier === pkg.identifier;
                const bestValue = kind === "yearly" && annualSaving !== null;
                const isCurrent = isActiveStoreProduct(
                  pkg,
                  activeSubscriptionIds,
                );
                return (
                  <View key={pkg.identifier} style={styles.planSlot}>
                    {(bestValue || (index === 1 && !yearlyPkg)) && (
                      <View
                        style={[
                          styles.ribbon,
                          bestValue ? styles.goldRibbon : styles.greenRibbon,
                        ]}
                      >
                        <Text style={styles.ribbonText}>
                          {bestValue
                            ? `SAVE ${annualSaving}%`
                            : "MOST FLEXIBLE"}
                        </Text>
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: isCurrent }}
                      accessibilityLabel={`${planName(pkg, kind)}, ${pkg.product.priceString}${period ? ` per ${period}` : ""}${isCurrent ? ", current plan" : ""}`}
                      disabled={isCurrent}
                      onPress={() => {
                        chosenRef.current = true;
                        setSelectedIdentifier(pkg.identifier);
                      }}
                      style={({ pressed }) => [
                        styles.plan,
                        selected &&
                          (bestValue
                            ? styles.selectedGold
                            : styles.selectedGreen),
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          selected &&
                            (bestValue ? styles.radioGold : styles.radioGreen),
                        ]}
                      >
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.planCopy}>
                        <View style={styles.planTitleRow}>
                          <Text style={styles.planName}>
                            {planName(pkg, kind)}
                          </Text>
                          {isCurrent && (
                            <Text style={styles.current}>CURRENT</Text>
                          )}
                        </View>
                        <Text style={styles.planDescription}>
                          {planDescription(pkg, kind)}
                        </Text>
                      </View>
                      <View style={styles.priceWrap}>
                        <Text style={styles.price}>
                          {pkg.product.priceString}
                        </Text>
                        {period ? (
                          <Text style={styles.period}>
                            {kind === "lifetime" ? period : `per ${period}`}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Animated.View
          entering={FadeInDown.delay(220).duration(420)}
          style={styles.purchaseArea}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPro ? "Switch plan" : "Continue to checkout"}
            disabled={
              isLoading ||
              isRestoring ||
              packagesLoading ||
              showError ||
              activeIsCurrent
            }
            onPress={handlePurchase}
            style={({ pressed }) => [
              styles.purchasePress,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={["#006E49", "#004C35"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.purchaseButton,
                (packagesLoading || showError || activeIsCurrent) &&
                  styles.disabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF9E8" />
              ) : (
                <>
                  <Feather name="shield" size={18} color="#F8D96C" />
                  <Text style={styles.purchaseText}>
                    {activeIsCurrent
                      ? "Current plan"
                      : isPro
                        ? "Choose this plan"
                        : selectedPrice
                          ? `Continue with ${selectedPrice}`
                          : "Continue to checkout"}
                  </Text>
                  <Feather name="arrow-right" size={18} color="#FFF9E8" />
                </>
              )}
            </LinearGradient>
          </Pressable>
          <Text style={styles.secure}>
            <Feather name="lock" size={11} color="#638176" /> Secure,
            store-managed checkout.
          </Text>
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              onPress={handleRestore}
              disabled={isLoading || isRestoring}
              hitSlop={8}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color="#006E49" />
              ) : (
                <Text style={styles.link}>Restore purchase</Text>
              )}
            </Pressable>
            <Text style={styles.dot}>·</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(TERMS_URL)}
              hitSlop={8}
            >
              <Text style={styles.link}>Terms</Text>
            </Pressable>
            <Text style={styles.dot}>·</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(PRIVACY_URL)}
              hitSlop={8}
            >
              <Text style={styles.link}>Privacy</Text>
            </Pressable>
          </View>
          <Text style={styles.legal}>{selectedRenewalDisclosure}</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F5ED" },
  scrollContent: { backgroundColor: "#F7F5ED" },
  top: {
    minHeight: 303,
    backgroundColor: "#EAF2E7",
    paddingHorizontal: 25,
    overflow: "hidden",
  },
  topCompact: {
    minHeight: 285,
    paddingHorizontal: 20,
  },
  close: {
    position: "absolute",
    right: 16,
    top: 48,
    zIndex: 3,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  brand: {
    alignSelf: "center",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#07523A",
    marginTop: 12,
  },
  brandGold: { color: "#B78016" },
  hero: { marginTop: 34, width: "69%" },
  heroCompact: { marginTop: 28, width: "64%" },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.25,
    color: "#A06E10",
    marginBottom: 9,
  },
  headline: {
    fontSize: 39,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: "#063E2C",
  },
  headlineCompact: {
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -1,
  },
  subhead: {
    fontSize: 14,
    lineHeight: 19,
    color: "#49685D",
    marginTop: 12,
    maxWidth: 230,
  },
  tagArtwork: {
    position: "absolute",
    right: 23,
    top: 125,
    width: 107,
    height: 138,
    backgroundColor: "#008256",
    borderRadius: 22,
    transform: [{ rotate: "25deg" }],
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#0A553D",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  tagArtworkCompact: {
    right: 13,
    top: 142,
    width: 76,
    height: 104,
    borderRadius: 18,
  },
  tagHole: {
    position: "absolute",
    top: 13,
    left: 14,
    width: 17,
    height: 17,
    borderRadius: 10,
    backgroundColor: "#EAF2E7",
    borderWidth: 4,
    borderColor: "#07513A",
  },
  sparkOne: {
    position: "absolute",
    right: 19,
    top: 112,
    width: 9,
    height: 9,
    backgroundColor: "#C99722",
    transform: [{ rotate: "45deg" }],
  },
  sparkTwo: {
    position: "absolute",
    right: 127,
    bottom: 20,
    width: 6,
    height: 6,
    backgroundColor: "#07915D",
    transform: [{ rotate: "45deg" }],
  },
  valueCard: {
    marginHorizontal: 18,
    marginTop: -12,
    borderRadius: 22,
    padding: 20,
    backgroundColor: "#00583C",
    overflow: "hidden",
    shadowColor: "#124B3B",
    shadowOpacity: 0.17,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  valueHeader: { flexDirection: "row", alignItems: "center", marginBottom: 13 },
  valueIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.13)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  valueTitle: {
    fontSize: 17,
    color: "#FFF8E5",
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  benefit: { flexDirection: "row", alignItems: "center", marginTop: 11 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F7E7A9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: "#F9F8EB", fontSize: 13, fontWeight: "700" },
  benefitDetail: {
    color: "#B9D6C8",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  chartBars: {
    position: "absolute",
    right: -1,
    bottom: -1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    opacity: 0.18,
  },
  bar: {
    width: 13,
    backgroundColor: "#F9E189",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  plansArea: { paddingHorizontal: 18, paddingTop: 25 },
  sectionLabel: {
    color: "#527065",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.15,
    marginBottom: 12,
  },
  planList: { gap: 11 },
  planSlot: { position: "relative" },
  ribbon: {
    position: "absolute",
    top: -7,
    left: 43,
    zIndex: 2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 7,
  },
  goldRibbon: { backgroundColor: "#B68117" },
  greenRibbon: { backgroundColor: "#097350" },
  ribbonText: {
    color: "#FFF9E9",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  plan: {
    minHeight: 75,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#D6DED4",
    backgroundColor: "#FCFBF5",
    padding: 14,
  },
  selectedGreen: { borderColor: "#007451", backgroundColor: "#F1F8F1" },
  selectedGold: { borderColor: "#B68117", backgroundColor: "#FFF9E9" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  radio: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#C5D1C9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  radioGreen: { borderColor: "#007451", backgroundColor: "#007451" },
  radioGold: { borderColor: "#B68117", backgroundColor: "#B68117" },
  radioDot: {
    height: 9,
    width: 9,
    borderRadius: 5,
    backgroundColor: "#FFFBEF",
  },
  planCopy: { flex: 1 },
  planTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  planName: { color: "#123B2D", fontSize: 16, fontWeight: "800" },
  current: {
    fontSize: 8,
    fontWeight: "800",
    color: "#006B4A",
    backgroundColor: "#D9EFE0",
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
  },
  planDescription: { color: "#71877B", fontSize: 11, marginTop: 3 },
  priceWrap: { alignItems: "flex-end" },
  price: { color: "#006B4A", fontSize: 19, fontWeight: "800" },
  period: { color: "#71877B", fontSize: 10, marginTop: 1 },
  skeletonWrap: { gap: 11 },
  skeleton: { height: 75, borderRadius: 17, backgroundColor: "#E5EAE1" },
  statusCard: {
    borderRadius: 17,
    padding: 22,
    alignItems: "center",
    backgroundColor: "#FFF7F1",
    borderWidth: 1,
    borderColor: "#E7CCBC",
  },
  statusTitle: {
    color: "#633426",
    fontWeight: "800",
    fontSize: 16,
    marginTop: 8,
  },
  statusText: { color: "#896254", fontSize: 13, marginTop: 4 },
  retry: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "#F3E1D5",
  },
  retryText: { color: "#91442E", fontWeight: "800" },
  purchaseArea: { paddingHorizontal: 18, marginTop: 21 },
  purchasePress: { width: "100%" },
  purchaseButton: {
    height: 57,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#00452F",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  disabled: { opacity: 0.58 },
  purchaseText: { color: "#FFF9E8", fontWeight: "800", fontSize: 16 },
  secure: {
    alignSelf: "center",
    color: "#6C8478",
    fontSize: 11,
    marginTop: 11,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 21,
  },
  link: { color: "#176148", fontSize: 12, fontWeight: "700" },
  dot: { color: "#A1B2A8" },
  legal: {
    textAlign: "center",
    color: "#809187",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 16,
    paddingHorizontal: 10,
  },
});
