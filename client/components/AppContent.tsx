import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
});
