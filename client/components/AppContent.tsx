import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { useDesignTokens } from "@/hooks/useDesignTokens";

export function AppContent() {
  const { isDarkMode } = useDesignTokens();

  return (
    <>
      <NavigationContainer>
        <RootStackNavigator />
      </NavigationContainer>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
    </>
  );
}
