import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
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
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";

const PRIVACY_URL = "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const FEATURES = [
  { icon: "camera" as const,      text: "Unlimited product scans",                       color: "#10B981" },
  { icon: "trending-up" as const, text: "Sold prices — see what items actually sell for", color: "#10B981" },
  { icon: "bar-chart-2" as const, text: "Buy Score — instant demand & profit rating",     color: "#10B981" },
  { icon: "dollar-sign" as const, text: "Unlimited price comparisons",                    color: "#10B981" },
];

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  scansUsed?: number;
}

export default function UpgradeModal({ visible, onClose, scansUsed = 0 }: UpgradeModalProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const { packages, purchasePackage, restorePurchases, isPro } = useRevenueCat();

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
        onClose();
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
        onClose();
      } else {
        Alert.alert("No Subscription Found", result.error || "No active subscription found.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  if (isPro) return null;

  const cardColor = "#FFFFFF";
  const planCardBg = "#F0FDF8";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <LinearGradient
        colors={["#F0FDF8", "#FFFFFF", "#F0FDF8"]}
        style={styles.container}
      >
        <Pressable
          onPress={onClose}
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
                colors={["#34D399", "#10B981", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <Feather name="tag" size={36} color="#fff" />
              </LinearGradient>
            </View>

            {/* Title & subtitle */}
            <Text style={[styles.title, { color: theme.colors.foreground }]}>
              Know exactly what to buy & sell
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
                      borderColor: "rgba(16,185,129,0.25)",
                    },
                  ]}
                >
                  <View style={[styles.featureIconCircle, { backgroundColor: "#10B98122" }]}>
                    <Feather name={f.icon} size={16} color={f.color} />
                  </View>
                  <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                    {f.text}
                  </Text>
                  <Feather name="check" size={16} color="#10B981" />
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
                        backgroundColor: selectedPlan === "weekly" ? planCardBg : "#F9FAFB",
                        borderColor: selectedPlan === "weekly" ? "#10B981" : "#E5E7EB",
                      },
                    ]}
                  >
                    <View style={styles.planLeft}>
                      <Text style={[styles.planName, { color: theme.colors.foreground }]}>Weekly</Text>
                      <Text style={[styles.planTrialText, { color: "#10B981" }]}>
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
                        borderColor: selectedPlan === "monthly" ? "#10B981" : "#E5E7EB",
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
                      <Text style={[styles.planTrialText, { color: "#10B981" }]}>
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
                <View style={[styles.planCard, { backgroundColor: planCardBg, borderColor: "#10B981" }]}>
                  <View style={styles.planLeft}>
                    <Text style={[styles.planTrialText, { color: "#10B981", fontSize: 16 }]}>
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
                disabled={isLoading || isRestoring}
                style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, width: "100%" }]}
              >
                <LinearGradient
                  colors={["#34D399", "#10B981", "#059669"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaButton}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
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
    </Modal>
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
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
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
    fontSize: 13,
  },
  planCheck: {
    marginLeft: 12,
  },
  checkFilled: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#10B981",
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
    shadowColor: "#10B981",
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
