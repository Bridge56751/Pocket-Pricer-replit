import React, { useState, useEffect, useCallback } from "react";
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
  BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Animated, {
  FadeInUp,
  FadeInDown,
} from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

const PRIVACY_URL = "https://pocket-pricer.com/pocket-pricer-privacy-policy-v5.html";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const FEATURES = [
  { icon: "camera" as const, text: "Unlimited product scans" },
  { icon: "bar-chart-2" as const, text: "Multi-platform price comparison" },
  { icon: "trending-up" as const, text: "eBay sold data & Buy Score" },
  { icon: "dollar-sign" as const, text: "Instant profit calculator" },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { packages, purchasePackage, restorePurchases, isPro, isReady: rcReady } = useRevenueCat();

  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const getPrice = () => {
    if (packages.length > 0) {
      const monthlyPackage = packages.find(
        (pkg) => pkg.packageType === "MONTHLY" || pkg.identifier === "$rc_monthly"
      ) || packages[0];
      return monthlyPackage.product.priceString;
    }
    return "$8.99";
  };

  const navigateHome = () => {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "Home" }],
      })
    );
  };

  const handleStartTrial = async () => {
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
        Alert.alert("No Subscription Found", result.error || "No active subscription found for this account.");
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message || "Failed to restore purchases.");
    } finally {
      setIsRestoring(false);
    }
  };

  useEffect(() => {
    if (isPro) {
      navigateHome();
    }
  }, [isPro]);

  const handleBackPress = useCallback(() => {
    return true;
  }, []);

  useEffect(() => {
    if (Platform.OS === "android") {
      const subscription = BackHandler.addEventListener("hardwareBackPress", handleBackPress);
      return () => subscription.remove();
    }
  }, [handleBackPress]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (rcReady && !isPro) {
        e.preventDefault();
      }
    });
    return unsubscribe;
  }, [navigation, isPro, rcReady]);

  if (isPro) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.iconRow}>
          <LinearGradient
            colors={["#34D399", "#10B981", "#059669"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Feather name="unlock" size={36} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.delay(200).duration(500)}
          style={[styles.title, { color: theme.colors.foreground }]}
        >
          Unlock Pocket Pricer
        </Animated.Text>

        <Animated.Text
          entering={FadeInUp.delay(300).duration(500)}
          style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
        >
          Start your free trial to keep scanning
        </Animated.Text>

        <Animated.View
          entering={FadeInUp.delay(400).duration(500)}
          style={[styles.trialBadge, { backgroundColor: "#10B98120" }]}
        >
          <Feather name="gift" size={16} color="#10B981" />
          <Text style={styles.trialBadgeText}>3 days free, then {getPrice()}/month</Text>
        </Animated.View>

        <Animated.View
          entering={FadeInUp.delay(500).duration(500)}
          style={[styles.featuresCard, { backgroundColor: theme.colors.card }]}
        >
          {FEATURES.map((feature, index) => (
            <View key={feature.text} style={styles.featureRow}>
              <View style={[styles.featureIconCircle, { backgroundColor: "#10B98118" }]}>
                <Feather name={feature.icon} size={18} color="#10B981" />
              </View>
              <Text style={[styles.featureText, { color: theme.colors.foreground }]}>
                {feature.text}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.ctaSection}>
          <Pressable
            onPress={handleStartTrial}
            disabled={isLoading || isRestoring}
            style={({ pressed }) => [styles.ctaPressable, { opacity: pressed ? 0.9 : 1 }]}
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
                  <Text style={styles.ctaButtonText}>Start 3-Day Free Trial</Text>
                  <Feather name="arrow-right" size={20} color="#fff" />
                </>
              )}
            </LinearGradient>
          </Pressable>

          <Text style={[styles.ctaSubtext, { color: theme.colors.mutedForeground }]}>
            Cancel anytime. No charge until trial ends.
          </Text>

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
        </Animated.View>

        <View style={styles.legalSection}>
          <Text style={[styles.disclosureText, { color: theme.colors.mutedForeground }]}>
            Payment will be charged to your Apple ID account at the end of the free trial period. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. Manage or cancel in Settings {"\u2192"} Apple ID {"\u2192"} Subscriptions.
          </Text>

          <View style={styles.legalLinks}>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={[styles.legalLinkText, { color: theme.colors.mutedForeground }]}>
                Privacy Policy
              </Text>
            </Pressable>
            <Text style={[styles.legalSeparator, { color: theme.colors.mutedForeground }]}>
              {" | "}
            </Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={[styles.legalLinkText, { color: theme.colors.mutedForeground }]}>
                Terms of Use
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  iconRow: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 28,
  },
  trialBadgeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#10B981",
  },
  featuresCard: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
    gap: 16,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  featureIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  ctaSection: {
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
  },
  ctaPressable: {
    width: "100%",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
    width: "100%",
  },
  ctaButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  ctaSubtext: {
    fontSize: 13,
    marginTop: 10,
    marginBottom: 16,
  },
  restoreButton: {
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: "500",
  },
  legalSection: {
    alignItems: "center",
    paddingHorizontal: 8,
  },
  disclosureText: {
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 12,
  },
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
  },
  legalLinkText: {
    fontSize: 12,
  },
  legalSeparator: {
    fontSize: 12,
  },
});
