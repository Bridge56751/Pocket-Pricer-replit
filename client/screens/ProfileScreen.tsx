import React, { useState } from "react";
import { View, StyleSheet, Pressable, Text, Alert, Platform, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { ScrollView } from "react-native";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { clearSearchHistory, clearFavorites } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { getApiUrl } from "@/lib/query-client";
import UpgradeModal from "@/components/UpgradeModal";

type ThemeOption = "light" | "dark" | "system";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, themeMode, setThemeMode } = useDesignTokens();
  const { user, token, logout, checkSubscription, refreshUser } = useAuth();
  const { isPro, restorePurchases } = useRevenueCat();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
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
        await checkSubscription();
        await refreshUser();
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

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
    } else {
      Alert.alert(
        "Log Out",
        "Are you sure you want to log out?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Log Out", onPress: logout },
        ]
      );
    }
  };

  const handleThemeChange = (mode: ThemeOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(mode);
  };

  const handleOpenPrivacyPolicy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const privacyUrl = new URL("/privacy", getApiUrl()).toString();
      await WebBrowser.openBrowserAsync(privacyUrl);
    } catch (error) {
      console.error("Failed to open privacy policy:", error);
    }
  };

  const handleOpenTermsOfService = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const termsUrl = new URL("/terms", getApiUrl()).toString();
      await WebBrowser.openBrowserAsync(termsUrl);
    } catch (error) {
      console.error("Failed to open terms of service:", error);
    }
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === "web") {
      if (confirm("Are you sure you want to delete all your data? This action cannot be undone.")) {
        performDeleteAccount();
      }
    } else {
      Alert.alert(
        "Delete Account Data",
        "Are you sure you want to delete all your data? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDeleteAccount },
        ]
      );
    }
  };

  const performDeleteAccount = async () => {
    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await clearSearchHistory();
      await clearFavorites();
      
      const response = await fetch(new URL("/api/auth/account", getApiUrl()).toString(), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete account");
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await logout();
    } catch (error) {
      console.error("Failed to delete account:", error);
      if (Platform.OS === "web") {
        alert("Failed to delete account. Please try again.");
      } else {
        Alert.alert("Error", "Failed to delete account. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "smartphone" },
  ];

  const isSubscribed = user?.subscriptionStatus === "active" || isPro;

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
      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="user" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Account
          </Text>
        </View>

        <View style={styles.accountInfo}>
          <Text style={[styles.emailText, { color: theme.colors.foreground }]}>
            {user?.email}
          </Text>
          <View style={[
            styles.planBadge, 
            { backgroundColor: isSubscribed ? theme.colors.primary : theme.colors.muted }
          ]}>
            <Text style={[
              styles.planBadgeText, 
              { color: isSubscribed ? "#fff" : theme.colors.foreground }
            ]}>
              {isSubscribed ? "Pro" : "Free"}
            </Text>
          </View>
        </View>

        {!isSubscribed ? (
          <>
            <Text style={[styles.upgradeHint, { color: theme.colors.mutedForeground }]}>
              {user?.searchesRemaining === -1 
                ? "Unlimited scans" 
                : `${user?.searchesRemaining || 0} free scans remaining`}
            </Text>
            <Pressable
              onPress={handleUpgrade}
              style={({ pressed }) => [
                styles.upgradeButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="zap" size={18} color="#fff" />
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
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
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={[styles.restoreButtonText, { color: theme.colors.primary }]}>
                  Restore Purchase
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
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
          </>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="moon" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Appearance
          </Text>
        </View>

        <View style={styles.themeOptions}>
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => handleThemeChange(option.value)}
              style={({ pressed }) => [
                styles.themeOption,
                { 
                  backgroundColor: themeMode === option.value 
                    ? theme.colors.primary 
                    : theme.colors.muted,
                  opacity: pressed ? 0.7 : 1 
                }
              ]}
            >
              <Feather 
                name={option.icon as any} 
                size={18} 
                color={themeMode === option.value ? "#fff" : theme.colors.foreground} 
              />
              <Text style={[
                styles.themeOptionText, 
                { color: themeMode === option.value ? "#fff" : theme.colors.foreground }
              ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
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

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: theme.colors.mutedForeground }]}>
            Version 1.0.0
          </Text>
        </View>
      </View>

      <View style={[styles.section, styles.dangerSection, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="alert-triangle" size={20} color={theme.colors.danger} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Account
          </Text>
        </View>

        <Text style={[styles.warningText, { color: theme.colors.mutedForeground }]}>
          Deleting your account will permanently remove all your scan history, favorites, and saved data.
        </Text>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          style={({ pressed }) => [
            styles.deleteButton,
            { 
              backgroundColor: theme.colors.danger,
              opacity: pressed || isDeleting ? 0.7 : 1 
            }
          ]}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.deleteButtonText}>
            {isDeleting ? "Deleting..." : "Delete All Data"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [
          styles.logoutButton,
          { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
        ]}
      >
        <Feather name="log-out" size={18} color={theme.colors.mutedForeground} />
        <Text style={[styles.logoutButtonText, { color: theme.colors.mutedForeground }]}>
          Log Out
        </Text>
      </Pressable>
      
      <UpgradeModal 
        visible={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
      />
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
  dangerSection: {
    marginTop: 8,
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
  themeOptions: {
    flexDirection: "row",
    gap: 10,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  themeOptionText: {
    fontSize: 14,
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
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  accountInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  emailText: {
    fontSize: 16,
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
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginBottom: 20,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
