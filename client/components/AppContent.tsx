import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import OnboardingScreen, { checkOnboardingComplete } from "@/screens/OnboardingScreen";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useRevenueCat } from "@/contexts/RevenueCatContext";

let _triggerReplay: (() => void) | null = null;
export function triggerOnboardingReplay() {
  _triggerReplay?.();
}

export function AppContent() {
  const { isDarkMode, theme } = useDesignTokens();
  const { isPro, isReady: rcReady } = useRevenueCat();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [isOnboardingReplay, setIsOnboardingReplay] = useState(false);
  const hasCompletedOnboardingOnce = React.useRef(false);

  useEffect(() => {
    checkOnboardingComplete().then((complete) => {
      hasCompletedOnboardingOnce.current = complete;
      setShowOnboarding(!complete);
    });

    _triggerReplay = () => {
      setIsOnboardingReplay(true);
      setShowOnboarding(true);
    };
    return () => { _triggerReplay = null; };
  }, []);

  useEffect(() => {
    if (rcReady && isPro && !isOnboardingReplay) {
      setShowOnboarding(false);
    }
  }, [rcReady, isPro, isOnboardingReplay]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setIsOnboardingReplay(false);
  };

  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      const { url } = event;
      console.log("Deep link received:", url);

      if (url.includes("subscription-success")) {
        console.log("Subscription successful via deep link");
      }
    };

    const subscription = Linking.addEventListener("url", handleDeepLink);

    Linking.getInitialURL().then((url) => {
      if (url && url.includes("subscription-success")) {
        console.log("App opened with subscription success URL");
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (showOnboarding === null) {
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
        <OnboardingScreen onComplete={handleOnboardingComplete} isReplay={isOnboardingReplay} />
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
