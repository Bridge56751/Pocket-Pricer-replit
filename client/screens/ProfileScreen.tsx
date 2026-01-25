import React, { useState, useEffect } from "react";
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
import { getApiUrl } from "@/lib/query-client";
import UpgradeModal from "@/components/UpgradeModal";

interface SubscriptionInfo {
  cancelAtPeriodEnd: boolean;
  periodEndDate: string | null;
}

type ThemeOption = "light" | "dark" | "system";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, themeMode, setThemeMode, isDarkMode } = useDesignTokens();
  const { user, token, logout, checkSubscription } = useAuth();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [isLoadingCancel, setIsLoadingCancel] = useState(false);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);

  useEffect(() => {
    if (user?.subscriptionStatus === "active" && token) {
      fetchSubscriptionInfo();
    }
  }, [user?.subscriptionStatus, token]);

  const fetchSubscriptionInfo = async () => {
    try {
      const response = await fetch(new URL("/api/subscription/check", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === "active") {
        setSubscriptionInfo({
          cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
          periodEndDate: data.periodEndDate || null,
        });
      }
    } catch (error) {
      console.error("Failed to fetch subscription info:", error);
    }
  };

  const handleUpgrade = async () => {
    if (!token) return;
    
    setIsLoadingCheckout(true);
    
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
      } else {
        console.error("Checkout error:", data.error);
      }
    } catch (error) {
      console.error("Failed to start checkout:", error);
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!token) return;
    
    setIsLoadingPortal(true);
    
    try {
      const response = await fetch(new URL("/api/customer-portal", getApiUrl()).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      
      const data = await response.json();
      
      if (data.url) {
        await Linking.openURL(data.url);
      } else {
        console.error("Portal error:", data.error);
      }
    } catch (error) {
      console.error("Failed to open customer portal:", error);
    } finally {
      setIsLoadingPortal(false);
    }
  };

  const handleCancelSubscription = () => {
    const confirmCancel = async () => {
      setIsLoadingCancel(true);
      try {
        const response = await fetch(new URL("/api/subscription/cancel", getApiUrl()).toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        
        if (data.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const endDate = data.accessUntil ? new Date(data.accessUntil).toLocaleDateString() : "the end of your billing period";
          
          if (Platform.OS === "web") {
            alert(`Your subscription has been cancelled. You'll continue to have Pro access until ${endDate}.`);
          } else {
            Alert.alert("Subscription Cancelled", `You'll continue to have Pro access until ${endDate}.`);
          }
          fetchSubscriptionInfo();
        } else {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error("Cancel error:", error);
        if (Platform.OS === "web") {
          alert("Failed to cancel subscription. Please try again.");
        } else {
          Alert.alert("Error", "Failed to cancel subscription. Please try again.");
        }
      } finally {
        setIsLoadingCancel(false);
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Are you sure you want to cancel? You'll keep Pro access until the end of your billing period.")) {
        confirmCancel();
      }
    } else {
      Alert.alert(
        "Cancel Subscription",
        "Are you sure you want to cancel? You'll keep Pro access until the end of your billing period.",
        [
          { text: "Keep Subscription", style: "cancel" },
          { text: "Cancel Subscription", style: "destructive", onPress: confirmCancel },
        ]
      );
    }
  };

  const handleReactivateSubscription = async () => {
    setIsLoadingCancel(true);
    try {
      const response = await fetch(new URL("/api/subscription/reactivate", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (Platform.OS === "web") {
          alert("Your subscription has been reactivated!");
        } else {
          Alert.alert("Success", "Your subscription has been reactivated!");
        }
        fetchSubscriptionInfo();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error("Reactivate error:", error);
      if (Platform.OS === "web") {
        alert("Failed to reactivate subscription. Please try again.");
      } else {
        Alert.alert("Error", "Failed to reactivate subscription. Please try again.");
      }
    } finally {
      setIsLoadingCancel(false);
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
    const baseUrl = getApiUrl().replace(':5000', '');
    const privacyUrl = `${baseUrl}:5000/privacy`;
    await WebBrowser.openBrowserAsync(privacyUrl);
  };

  const handleOpenTermsOfService = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const baseUrl = getApiUrl().replace(':5000', '');
    const termsUrl = `${baseUrl}:5000/terms`;
    await WebBrowser.openBrowserAsync(termsUrl);
  };

  const handleDeleteAccount = () => {
    if (user?.subscriptionStatus === "active" && !subscriptionInfo?.cancelAtPeriodEnd) {
      if (Platform.OS === "web") {
        alert("Please cancel your subscription first before deleting your account.");
      } else {
        Alert.alert(
          "Active Subscription",
          "Please cancel your subscription first before deleting your account. You can cancel from the Account section above.",
          [{ text: "OK" }]
        );
      }
      return;
    }

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        alert("All data has been deleted successfully.");
      } else {
        Alert.alert("Success", "All data has been deleted successfully.");
      }
    } catch (error) {
      console.error("Failed to delete data:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "smartphone" },
  ];

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
            { backgroundColor: user?.subscriptionStatus === "active" ? theme.colors.primary : theme.colors.muted }
          ]}>
            <Text style={[
              styles.planBadgeText, 
              { color: user?.subscriptionStatus === "active" ? "#fff" : theme.colors.foreground }
            ]}>
              {user?.subscriptionStatus === "active" ? "Pro" : "Free"}
            </Text>
          </View>
        </View>

        {user?.subscriptionStatus !== "active" ? (
          <>
            <Text style={[styles.upgradeHint, { color: theme.colors.mutedForeground }]}>
              {user?.searchesRemaining === -1 
                ? "Unlimited scans" 
                : `${user?.searchesRemaining || 0} free scans remaining`}
            </Text>
            <Pressable
              onPress={handleUpgrade}
              disabled={isLoadingCheckout}
              style={({ pressed }) => [
                styles.upgradeButton,
                { backgroundColor: theme.colors.primary, opacity: pressed || isLoadingCheckout ? 0.7 : 1 }
              ]}
            >
              {isLoadingCheckout ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Feather name="zap" size={18} color="#fff" />
                  <Text style={styles.upgradeButtonText}>Upgrade to Pro - $8.99/mo</Text>
                </>
              )}
            </Pressable>
          </>
        ) : (
          <>
            {subscriptionInfo?.cancelAtPeriodEnd ? (
              <>
                <Text style={[styles.upgradeHint, { color: theme.colors.danger }]}>
                  Cancels on {subscriptionInfo.periodEndDate ? new Date(subscriptionInfo.periodEndDate).toLocaleDateString() : "end of period"}
                </Text>
                <Pressable
                  onPress={handleReactivateSubscription}
                  disabled={isLoadingCancel}
                  style={({ pressed }) => [
                    styles.upgradeButton,
                    { backgroundColor: theme.colors.primary, opacity: pressed || isLoadingCancel ? 0.7 : 1 }
                  ]}
                >
                  {isLoadingCancel ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={18} color="#fff" />
                      <Text style={styles.upgradeButtonText}>Keep My Subscription</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.upgradeHint, { color: theme.colors.mutedForeground }]}>
                  Unlimited product scans
                </Text>
                <Pressable
                  onPress={handleCancelSubscription}
                  disabled={isLoadingCancel}
                  style={({ pressed }) => [
                    styles.cancelButton,
                    { borderColor: theme.colors.danger, opacity: pressed || isLoadingCancel ? 0.7 : 1 }
                  ]}
                >
                  {isLoadingCancel ? (
                    <ActivityIndicator color={theme.colors.danger} size="small" />
                  ) : (
                    <Text style={[styles.cancelButtonText, { color: theme.colors.danger }]}>
                      Cancel Subscription
                    </Text>
                  )}
                </Pressable>
              </>
            )}
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
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  cancelButtonText: {
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
