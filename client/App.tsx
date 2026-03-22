import React, { useEffect } from "react";
import { StyleSheet, useColorScheme, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import { AppContent } from "@/components/AppContent";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const systemColorScheme = useColorScheme() ?? "light";
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const initFacebookSDK = async () => {
      if (Platform.OS === "web") return;
      try {
        const Constants = await import("expo-constants");
        const isExpoGo = Constants.default?.appOwnership === "expo";
        if (isExpoGo) return;

        let trackingGranted = false;
        try {
          if (Platform.OS === "ios") {
            const { requestTrackingPermissionsAsync } = await import("expo-tracking-transparency");
            const { status } = await requestTrackingPermissionsAsync();
            trackingGranted = status === "granted";
          }
        } catch (attError) {
          console.log("ATT request failed:", attError);
        }

        try {
          const { Settings } = await import("react-native-fbsdk-next");
          await Settings.initializeSDK();
          if (Platform.OS === "ios") {
            await Settings.setAdvertiserTrackingEnabled(trackingGranted);
          }
          console.log("Facebook SDK initialized");
        } catch (fbError) {
          console.log("Facebook SDK init failed:", fbError);
        }
      } catch (error) {
        console.log("Facebook SDK init:", error);
      }
    };

    const initFirebaseAnalytics = async () => {
      if (Platform.OS === "web") return;
      try {
        const Constants = await import("expo-constants");
        const isExpoGo = Constants.default?.appOwnership === "expo";
        if (isExpoGo) return;

        const analytics = await import("@react-native-firebase/analytics");
        await analytics.default().logAppOpen();
        console.log("Firebase Analytics initialized");
      } catch (firebaseError) {
        console.log("Firebase Analytics init failed:", firebaseError);
      }
    };

    const initAppsFlyer = async () => {
      if (Platform.OS === "web") return;
      try {
        const Constants = await import("expo-constants");
        const isExpoGo = Constants.default?.appOwnership === "expo";
        if (isExpoGo) return;

        const appsFlyer = await import("react-native-appsflyer");
        appsFlyer.default.initSdk(
          {
            devKey: "mfkZfMQWNe9nEc6NB23KJD",
            isDebug: false,
            appId: "6758423765",
            onInstallConversionDataListener: false,
            onDeepLinkListener: false,
          },
          () => { console.log("AppsFlyer initialized"); },
          (error: any) => { console.log("AppsFlyer init error:", error); }
        );
      } catch (error) {
        console.log("AppsFlyer init failed:", error);
      }
    };

    initFacebookSDK();
    initFirebaseAnalytics();
    initAppsFlyer();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <ThemeProvider systemColorScheme={systemColorScheme}>
                <RevenueCatProvider>
                  <AuthProvider>
                    <AppContent />
                  </AuthProvider>
                </RevenueCatProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
