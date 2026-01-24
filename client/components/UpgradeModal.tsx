import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ visible, onClose }: UpgradeModalProps) {
  const { theme } = useDesignTokens();
  const { token, checkSubscription } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!token) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(new URL("/api/create-checkout-session", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (data.url) {
        await Linking.openURL(data.url);
        onClose();
        setTimeout(() => {
          checkSubscription();
        }, 5000);
      } else {
        console.error("Checkout error:", data.error);
      }
    } catch (error) {
      console.error("Failed to start checkout:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
              $8.99
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
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.upgradeButtonText}>Subscribe Now</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose}>
            <Text style={[styles.laterText, { color: theme.colors.mutedForeground }]}>
              Maybe later
            </Text>
          </Pressable>
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
  laterText: {
    fontSize: 15,
    paddingVertical: 8,
  },
});
