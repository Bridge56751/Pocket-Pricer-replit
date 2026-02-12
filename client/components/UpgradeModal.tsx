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
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { useAuth } from "@/contexts/AuthContext";

const PRIVACY_URL = "https://pocket-pricer.com/privacy";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ visible, onClose }: UpgradeModalProps) {
  const { theme } = useDesignTokens();
  const { packages, purchasePackage, restorePurchases, isPro } = useRevenueCat();
  const { refreshUser, checkSubscription, user, isGuest, logout } = useAuth();
  
  const scansRemaining = isGuest ? 0 : Math.max(0, user?.searchesRemaining || 0);
  const hasUsedAllScans = isGuest || scansRemaining === 0;
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

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
        await checkSubscription();
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
        await checkSubscription();
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
            Pocket Pricer Pro
          </Text>

          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            Monthly subscription — {getPrice()}/month
          </Text>

          {isGuest ? (
            <Text style={[styles.freeScansNote, { color: theme.colors.mutedForeground }]}>
              You've used all 5 of your free scans. Create an account to continue or upgrade to Pro for unlimited scans.
            </Text>
          ) : hasUsedAllScans ? (
            <Text style={[styles.freeScansNote, { color: theme.colors.mutedForeground }]}>
              You've used all 5 of your free scans
            </Text>
          ) : (
            <Text style={[styles.freeScansNote, { color: theme.colors.mutedForeground }]}>
              {scansRemaining} free scan{scansRemaining === 1 ? '' : 's'} remaining
            </Text>
          )}

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
                Unlimited searches
              </Text>
            </View>
          </View>

          {isGuest ? (
            <Pressable
              style={[styles.upgradeButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => {
                onClose();
                logout();
              }}
            >
              <Text style={styles.upgradeButtonText}>Create Account</Text>
            </Pressable>
          ) : (
            <>
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
            </>
          )}

          <Pressable onPress={onClose}>
            <Text style={[styles.laterText, { color: theme.colors.mutedForeground }]}>
              Maybe later
            </Text>
          </Pressable>

          {isGuest ? null : (
            <>
              <Text style={[styles.subscriptionDisclosure, { color: theme.colors.mutedForeground }]}>
                Payment will be charged to your Apple ID account. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions.
              </Text>

              <View style={styles.legalLinks}>
                <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
                  <Text style={[styles.legalText, { color: theme.colors.mutedForeground }]}>
                    Privacy Policy
                  </Text>
                </Pressable>
                <Text style={[styles.legalSeparator, { color: theme.colors.mutedForeground }]}>
                  {" | "}
                </Text>
                <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
                  <Text style={[styles.legalText, { color: theme.colors.mutedForeground }]}>
                    Terms of Use
                  </Text>
                </Pressable>
              </View>
            </>
          )}
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
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  freeScansNote: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
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
  subscriptionDisclosure: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  legalText: {
    fontSize: 12,
  },
  legalSeparator: {
    fontSize: 12,
  },
});
