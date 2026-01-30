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
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { useAuth } from "@/contexts/AuthContext";

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ visible, onClose }: UpgradeModalProps) {
  const { theme } = useDesignTokens();
  const { packages, purchasePackage, restorePurchases, isPro, isReady } = useRevenueCat();
  const { refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleUpgrade = async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Mobile Only",
        "Subscriptions are only available in the mobile app. Please use Expo Go on your iOS or Android device to subscribe."
      );
      return;
    }

    if (packages.length === 0) {
      Alert.alert("Error", "No subscription packages available. Please try again later.");
      return;
    }

    setIsLoading(true);

    try {
      const monthlyPackage = packages.find(
        (pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly"
      ) || packages[0];

      const result = await purchasePackage(monthlyPackage);

      if (result.success) {
        await refreshUser();
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
        await refreshUser();
        onClose();
        Alert.alert("Restored", "Your Pro subscription has been restored!");
      } else {
        Alert.alert("No Subscription Found", result.error || "No active subscription found for this account.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  const getPrice = () => {
    if (packages.length > 0) {
      const monthlyPackage = packages.find(
        (pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly"
      ) || packages[0];
      return monthlyPackage.product.priceString;
    }
    return "$8.99";
  };

  if (isPro) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: theme.colors.card }]}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Feather name="x" size={24} color={theme.colors.mutedForeground} />
          </Pressable>

          <View style={[styles.iconContainer, { backgroundColor: theme.colors.primary }]}>
            <Feather name="zap" size={32} color="#fff" />
          </View>

          <Text style={[styles.title, { color: theme.colors.foreground }]}>
            Upgrade to Pro
          </Text>

          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            You've used all 5 of your free scans
          </Text>

          <View style={styles.priceContainer}>
            <Text style={[styles.price, { color: theme.colors.foreground }]}>
              {getPrice()}
            </Text>
            <Text style={[styles.period, { color: theme.colors.mutedForeground }]}>
              /month
            </Text>
          </View>

          <View style={styles.features}>
            <View style={styles.featureRow}>
              <Feather name="check" size={20} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                Unlimited product scans
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={20} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                Unlimited eBay searches
              </Text>
            </View>
            <View style={styles.featureRow}>
              <Feather name="check" size={20} color={theme.colors.primary} />
              <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                Priority support
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.upgradeButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleUpgrade}
            disabled={isLoading || isRestoring}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.upgradeButtonText}>Subscribe Now</Text>
            )}
          </Pressable>

          <Pressable 
            onPress={handleRestore}
            disabled={isLoading || isRestoring}
            style={styles.restoreButton}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={[styles.restoreText, { color: theme.colors.primary }]}>
                Restore Purchase
              </Text>
            )}
          </Pressable>

          <Pressable onPress={onClose}>
            <Text style={[styles.laterText, { color: theme.colors.mutedForeground }]}>
              Maybe later
            </Text>
          </Pressable>

          <Pressable onPress={() => setShowDebug(!showDebug)}>
            <Text style={[styles.debugToggle, { color: theme.colors.mutedForeground }]}>
              {showDebug ? "Hide Debug" : "Show Debug"}
            </Text>
          </Pressable>

          {showDebug ? (
            <View style={styles.debugContainer}>
              <Text style={[styles.debugText, { color: theme.colors.mutedForeground }]}>
                Ready: {isReady ? "Yes" : "No"}
              </Text>
              <Text style={[styles.debugText, { color: theme.colors.mutedForeground }]}>
                Packages: {packages.length}
              </Text>
              <Text style={[styles.debugText, { color: theme.colors.mutedForeground }]}>
                API Key: {process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ? "Set" : "Missing"}
              </Text>
              {packages.map((pkg, i) => (
                <Text key={i} style={[styles.debugText, { color: theme.colors.mutedForeground }]}>
                  Pkg {i}: {pkg.identifier} - {pkg.product?.priceString}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modal: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 24,
  },
  price: {
    fontSize: 40,
    fontWeight: "700",
  },
  period: {
    fontSize: 16,
    marginLeft: 4,
  },
  features: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureText: {
    fontSize: 16,
  },
  upgradeButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  restoreButton: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: "500",
  },
  laterText: {
    fontSize: 15,
    paddingVertical: 8,
  },
  debugToggle: {
    fontSize: 12,
    paddingVertical: 4,
    marginTop: 8,
  },
  debugContainer: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.1)",
    width: "100%",
  },
  debugText: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
