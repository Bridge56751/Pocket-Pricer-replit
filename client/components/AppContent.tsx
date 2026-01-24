import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import AuthScreen from "@/screens/AuthScreen";
import OnboardingScreen, { checkOnboardingComplete } from "@/screens/OnboardingScreen";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";

export function AppContent() {
  const { isDarkMode, theme } = useDesignTokens();
  const { isAuthenticated, isLoading } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboardingComplete().then((complete) => {
      setShowOnboarding(!complete);
    });
  }, []);

  if (isLoading || showOnboarding === null) {
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
        <OnboardingScreen onComplete={() => setShowOnboarding(false)} />
        <StatusBar style={isDarkMode ? "light" : "dark"} />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthScreen />
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
