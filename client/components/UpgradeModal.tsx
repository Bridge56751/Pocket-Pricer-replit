import React, { useState } from "react";
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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";

const PRIVACY_URL = "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const FEATURES = [
  { icon: "camera" as const,      text: "Unlimited product scans" },
  { icon: "bar-chart-2" as const, text: "Multi-platform price comparison" },
  { icon: "trending-up" as const, text: "eBay sold data & Buy Score" },
  { icon: "dollar-sign" as const, text: "Instant profit calculator" },
];

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ visible, onClose }: UpgradeModalProps) {
  const { theme, isDarkMode } = useDesignTokens();
  const { packages, purchasePackage, restorePurchases, isPro } = useRevenueCat();

  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const getPrice = () => {
    if (packages.length > 0) {
      const monthlyPackage =
        packages.find((pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly") ||
        packages[0];
      return monthlyPackage.product.priceString;
    }
    return "$8.99";
  };

  const handleUpgrade = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile Only", "Subscriptions are only available in the mobile app.");
      return;
    }
    if (packages.length === 0) {
      Alert.alert("Error", "No subscription packages available. Please try again later.");
      return;
    }
    setIsLoading(true);
    try {
      const monthlyPackage =
        packages.find((pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly") ||
        packages[0];
      const result = await purchasePackage(monthlyPackage);
      if (result.success) {
        onClose();
        Alert.alert("Success", "Welcome to Pocket Pricer Pro! You now have unlimited scans.");
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
        Alert.alert("Restored", "Your Pro subscription has been restored!");
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

  const cardColor = isDarkMode ? "#2C2C2E" : "#FFFFFF";
  const planCardBg = isDarkMode ? "#1C3A2E" : "#F0FDF8";
  const featureIconBg = isDarkMode ? "#1C3A2E" : "#F0FDF8";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          {/* Close button */}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={theme.colors.mutedForeground} />
          </Pressable>

          {/* Icon */}
          <LinearGradient
            colors={["#34D399", "#10B981", "#059669"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Feather name="tag" size={32} color="#fff" />
          </LinearGradient>

          {/* Title */}
          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Unlock Pocket Pricer Pro
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            Unlimited scans, real sold data & instant profit math.
          </Text>

          {/* Features */}
          <View style={styles.featuresList}>
            {FEATURES.map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <View style={[styles.featureIconCircle, { backgroundColor: featureIconBg }]}>
                  <Feather name={f.icon} size={15} color="#10B981" />
                </View>
                <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                  {f.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Plan card */}
          <View style={[styles.planCard, { backgroundColor: planCardBg, borderColor: "#10B981" }]}>
            <View style={styles.planLeft}>
              <Text style={[styles.planName, { color: theme.colors.foreground }]}>
                3-Day Free Trial
              </Text>
              <Text style={[styles.planPrice, { color: theme.colors.mutedForeground }]}>
                then {getPrice()}/month
              </Text>
            </View>
            <Feather name="check-circle" size={22} color="#10B981" />
          </View>

          {/* CTA */}
          <Pressable
            onPress={handleUpgrade}
            disabled={isLoading || isRestoring}
            style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1, width: "100%" }]}
          >
            <LinearGradient
              colors={["#34D399", "#10B981", "#059669"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaButton}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.ctaButtonText}>Start Free Trial</Text>
                  <Feather name="arrow-right" size={18} color="#fff" />
                </>
              )}
            </LinearGradient>
          </Pressable>

          {/* Footer links */}
          <View style={styles.footer}>
            <Pressable onPress={handleRestore} disabled={isLoading || isRestoring}>
              {isRestoring ? (
                <ActivityIndicator size="small" color="#10B981" />
              ) : (
                <Text style={[styles.footerLink, { color: theme.colors.mutedForeground }]}>
                  Restore
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

          {/* Legal */}
          <Text style={[styles.legalText, { color: theme.colors.mutedForeground }]}>
            Payment charged to your Apple ID at end of the 3-day free trial. Subscription automatically
            renews unless canceled at least 24 hours before the end of the current period. Manage in
            Settings → Apple ID → Subscriptions.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  closeButton: {
    position: "absolute",
    top: 14,
    right: 14,
    padding: 4,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  featuresList: {
    width: "100%",
    gap: 12,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  planCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  planLeft: {
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  planPrice: {
    fontSize: 13,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    width: "100%",
    marginBottom: 16,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  footerLink: {
    fontSize: 12,
    fontWeight: "500",
  },
  footerDot: {
    fontSize: 12,
  },
  legalText: {
    fontSize: 10,
    textAlign: "center",
    lineHeight: 15,
  },
});
