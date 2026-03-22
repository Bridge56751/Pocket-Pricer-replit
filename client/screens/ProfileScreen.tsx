import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Pressable, Text, Alert, Platform, ActivityIndicator, Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { resetOnboarding } from "@/screens/OnboardingScreen";
import { triggerOnboardingReplay } from "@/components/AppContent";
import { clearSearchHistory, clearFavorites } from "@/lib/storage";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<any>();
  const { theme } = useDesignTokens();
  const { getScansUsed } = useAuth();
  const { isPro, restorePurchases } = useRevenueCat();
  const [isRestoring, setIsRestoring] = useState(false);

  const [scansUsed, setScansUsed] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    getScansUsed().then(setScansUsed);
  }, []);

  const handleUpgrade = () => {
    navigation.navigate("Paywall");
  };

  const handleManageSubscription = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (Platform.OS === "ios") {
      await Linking.openURL("https://apps.apple.com/account/subscriptions");
    } else if (Platform.OS === "android") {
      await Linking.openURL("https://play.google.com/store/account/subscriptions");
    } else {
      Alert.alert(
        "Manage Subscription",
        "To manage your subscription, open Settings on your iOS or Android device and go to Subscriptions."
      );
    }
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile Only", "Please use the mobile app to restore purchases.");
      return;
    }

    setIsRestoring(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await restorePurchases();

      if (result.success) {
        Alert.alert("Restored", "Your Pro subscription has been restored!");
      } else {
        Alert.alert("No Subscription Found", result.error || "No active subscription found for this Apple ID.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleOpenPrivacyPolicy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const privacyUrl = "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
      await WebBrowser.openBrowserAsync(privacyUrl);
    } catch (error) {
      console.error("Failed to open privacy policy:", error);
    }
  };

  const handleOpenTermsOfService = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const termsUrl = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
      await WebBrowser.openBrowserAsync(termsUrl);
    } catch (error) {
      console.error("Failed to open terms of service:", error);
    }
  };

  const handleDeleteLocalData = async () => {
    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await clearSearchHistory();
      await clearFavorites();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error("Failed to delete local data:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const freeScansRemaining = Math.max(0, 3 - scansUsed);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      {isPro ? (
        <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
          <View style={styles.sectionHeader}>
            <Feather name="zap" size={20} color={theme.colors.primary} />
            <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
              Subscription
            </Text>
            <View style={[styles.planBadge, { backgroundColor: theme.colors.primary }]}>
              <Text style={[styles.planBadgeText, { color: "#fff" }]}>Pro</Text>
            </View>
          </View>
          <Text style={[styles.upgradeHint, { color: theme.colors.mutedForeground }]}>
            Unlimited product scans
          </Text>
          <Pressable
            onPress={handleManageSubscription}
            style={({ pressed }) => [
              styles.manageButton,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <Feather name="settings" size={18} color={theme.colors.foreground} />
            <Text style={[styles.manageButtonText, { color: theme.colors.foreground }]}>
              Manage Subscription
            </Text>
          </Pressable>
        </View>
      ) : (
        <LinearGradient
          colors={["#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.subscriptionGradient}
        >
          <View style={styles.sectionHeader}>
            <Feather name="zap" size={20} color="#F0D264" />
            <Text style={[styles.sectionTitle, { color: "#FFFFFF" }]}>
              Subscription
            </Text>
            <View style={[styles.planBadge, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
              <Text style={[styles.planBadgeText, { color: "#FFFFFF" }]}>Free</Text>
            </View>
          </View>
          <Text style={styles.subGradientHint}>
            {freeScansRemaining > 0
              ? `${freeScansRemaining} free scan${freeScansRemaining === 1 ? "" : "s"} remaining — try before you buy`
              : "You've used all your free scans — start your 3-day free trial"}
          </Text>
          <Pressable
            onPress={handleUpgrade}
            style={({ pressed }) => [
              styles.subGradientButton,
              { opacity: pressed ? 0.85 : 1 }
            ]}
          >
            <Feather name="zap" size={18} color="#3D2E00" />
            <Text style={styles.subGradientButtonText}>Upgrade to Pro</Text>
          </Pressable>
          
          <Pressable
            onPress={handleRestorePurchases}
            disabled={isRestoring}
            style={({ pressed }) => [
              styles.restoreButton,
              { opacity: pressed || isRestoring ? 0.7 : 1 }
            ]}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#F0D264" />
            ) : (
              <Text style={[styles.restoreButtonText, { color: "rgba(255,255,255,0.6)" }]}>
                Restore Purchase
              </Text>
            )}
          </Pressable>
          
          <Text style={styles.subGradientDisclosure}>
            Payment will be charged to your Apple ID account. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Manage or cancel in Settings → Apple ID → Subscriptions.
          </Text>
        </LinearGradient>
      )}

      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="database" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Data Management
          </Text>
        </View>

        <Text style={[styles.dataDescription, { color: theme.colors.mutedForeground }]}>
          Your scan history is stored locally on this device.
        </Text>

        {showDeleteConfirm ? (
          <View style={[styles.deleteConfirmBox, { backgroundColor: theme.colors.danger + '10', borderColor: theme.colors.danger + '30' }]}>
            <Feather name="alert-triangle" size={20} color={theme.colors.danger} />
            <Text style={[styles.deleteConfirmText, { color: theme.colors.foreground }]}>
              This will permanently delete your scan history. Your scan count and subscription will not be affected.
            </Text>
            <View style={styles.deleteConfirmButtons}>
              <Pressable
                onPress={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                style={({ pressed }) => [
                  styles.deleteConfirmCancel,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={[styles.deleteConfirmCancelText, { color: theme.colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteLocalData}
                disabled={isDeleting}
                style={({ pressed }) => [
                  styles.deleteConfirmAction,
                  { backgroundColor: theme.colors.danger, opacity: pressed || isDeleting ? 0.7 : 1 }
                ]}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteConfirmActionText}>Delete Data</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowDeleteConfirm(true);
            }}
            style={({ pressed }) => [
              styles.deleteDataButton,
              { borderColor: theme.colors.danger, opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <Feather name="trash-2" size={18} color={theme.colors.danger} />
            <Text style={[styles.deleteDataButtonText, { color: theme.colors.danger }]}>
              Delete Local Data
            </Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="info" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            About
          </Text>
        </View>

        <Pressable 
          onPress={handleOpenPrivacyPolicy}
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Privacy Policy
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <Pressable 
          onPress={handleOpenTermsOfService}
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Terms of Service
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <Pressable 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            WebBrowser.openBrowserAsync("https://pocket-pricer.com");
          }}
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Website
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <Pressable 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Linking.openURL("mailto:pricerpocket@gmail.com");
          }}
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Email Support
          </Text>
          <Text style={[styles.menuItemText, { color: theme.colors.mutedForeground }]}>
            pricerpocket@gmail.com
          </Text>
        </Pressable>

        <Pressable 
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await resetOnboarding();
            triggerOnboardingReplay();
          }}
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Replay Tutorial
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: theme.colors.mutedForeground }]}>
            Version 1.0.0
          </Text>
        </View>
      </View>
      
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  menuItemText: {
    fontSize: 16,
  },
  versionContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  versionText: {
    fontSize: 13,
  },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  upgradeHint: {
    fontSize: 14,
    marginBottom: 12,
  },
  upgradeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  upgradeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  restoreButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  subscriptionDisclosure: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 12,
  },
  subscriptionGradient: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  subGradientHint: {
    fontSize: 14,
    marginBottom: 16,
    color: "rgba(255,255,255,0.65)",
  },
  subGradientButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    backgroundColor: "#F0D264",
    overflow: "hidden" as const,
  },
  subGradientButtonText: {
    color: "#3D2E00",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  subGradientDisclosure: {
    fontSize: 11,
    textAlign: "center" as const,
    lineHeight: 16,
    marginTop: 12,
    color: "rgba(255,255,255,0.35)",
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  dataDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteDataButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  deleteDataButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  deleteConfirmBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  deleteConfirmText: {
    fontSize: 14,
    lineHeight: 20,
  },
  deleteConfirmButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  deleteConfirmCancel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteConfirmCancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  deleteConfirmAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteConfirmActionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
