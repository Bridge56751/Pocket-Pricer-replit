import React, { useState, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import AuthScreen from "@/screens/AuthScreen";
import OnboardingScreen, { checkOnboardingComplete } from "@/screens/OnboardingScreen";
import { LegalAgreementModal } from "@/components/LegalAgreementModal";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";

const LEGAL_ACCEPTED_KEY = "@pocket_pricer_legal_accepted";

export function AppContent() {
  const { isDarkMode, theme } = useDesignTokens();
  const { isAuthenticated, isLoading, checkSubscription } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [legalAccepted, setLegalAccepted] = useState<boolean | null>(null);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showDeclinedMessage, setShowDeclinedMessage] = useState(false);

  useEffect(() => {
    checkOnboardingComplete().then((complete) => {
      setShowOnboarding(!complete);
    });
    AsyncStorage.getItem(LEGAL_ACCEPTED_KEY).then((value) => {
      setLegalAccepted(value === "true");
    });
  }, []);

  const handleLegalAgree = async () => {
    await AsyncStorage.setItem(LEGAL_ACCEPTED_KEY, "true");
    setLegalAccepted(true);
    setShowLegalModal(false);
  };

  const handleLegalCancel = () => {
    setShowLegalModal(false);
    setShowDeclinedMessage(true);
  };

  const handleReviewTerms = () => {
    setShowDeclinedMessage(false);
    setShowLegalModal(true);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    if (!legalAccepted) {
      setShowLegalModal(true);
    }
  };

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      console.log("Deep link received:", url);
      
      if (url.includes("subscription-success")) {
        console.log("Subscription successful, refreshing user...");
        checkSubscription();
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url && url.includes("subscription-success")) {
        console.log("App opened with subscription success URL");
        checkSubscription();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkSubscription]);

  if (isLoading || showOnboarding === null || legalAccepted === null) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <StatusBar style={isDarkMode ? "light" : "dark"} />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
        <StatusBar style={isDarkMode ? "light" : "dark"} />
      </>
    );
  }

  if (!isAuthenticated) {
    if (showDeclinedMessage) {
      return (
        <View style={[styles.declinedContainer, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.declinedCard, { backgroundColor: theme.colors.card }]}>
            <View style={[styles.declinedIconContainer, { backgroundColor: theme.colors.muted }]}>
              <Feather name="alert-circle" size={32} color={theme.colors.mutedForeground} />
            </View>
            <Text style={[styles.declinedTitle, { color: theme.colors.foreground }]}>
              Agreement Required
            </Text>
            <Text style={[styles.declinedMessage, { color: theme.colors.mutedForeground }]}>
              To use Pocket Pricer, you must agree to our Terms of Service and Privacy Policy. We cannot provide access to the app without your acceptance.
            </Text>
            <Pressable
              onPress={handleReviewTerms}
              style={({ pressed }) => [
                styles.reviewButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.reviewButtonText}>Review Terms</Text>
            </Pressable>
          </View>
          <StatusBar style={isDarkMode ? "light" : "dark"} />
        </View>
      );
    }

    return (
      <>
        <AuthScreen />
        <LegalAgreementModal
          visible={showLegalModal}
          onAgree={handleLegalAgree}
          onCancel={handleLegalCancel}
        />
        <StatusBar style={isDarkMode ? "light" : "dark"} />
      </>
    );
  }

  return (
    <>
      <NavigationContainer>
        <RootStackNavigator />
      </NavigationContainer>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  declinedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  declinedCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
  },
  declinedIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  declinedTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  declinedMessage: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 24,
  },
  reviewButton: {
    width: "100%",
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  reviewButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
