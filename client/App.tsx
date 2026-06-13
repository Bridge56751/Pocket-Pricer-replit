import React, { useEffect, useState } from "react";
import { StyleSheet, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Updates from "expo-updates";
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

const STARTUP_OTA_TIMEOUT_MS = 5000;

/**
 * Check for an OTA update before showing the app. If a newer compatible update
 * is available, download it and immediately reload into it so fresh installs
 * don't run an old embedded bundle until the user manually restarts.
 *
 * Why this matters: paired with the eas.json channel config + the app.json
 * `updates.url` setting, this lets us ship JS-only changes (text fixes,
 * minor UI tweaks, server-contract response handling like the cooldown UI
 * for new rateLimit shapes) without going through App Store review again.
 *
 * Behavior:
 *  - In Expo Go / development / web-like disabled-update contexts: skip.
 *  - In a TestFlight / App Store / Play Store build: checks the configured
 *    EAS Update channel for a matching `runtimeVersion` (currently keyed
 *    on app.json's `version` per the `appVersion` policy). If a newer
 *    update exists, it is downloaded and launched before the old UI renders.
 */
async function applyStartupOtaUpdate(
  shouldContinue: () => boolean,
): Promise<"ready" | "reloading"> {
  if (__DEV__ || Platform.OS === "web" || !Updates.isEnabled) return "ready";

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!shouldContinue()) return "ready";

    if (!update.isAvailable) return "ready";

    const fetchResult = await Updates.fetchUpdateAsync();
    if (!shouldContinue()) return "ready";

    if (fetchResult.isNew) {
      await Updates.reloadAsync();
      return "reloading";
    }
  } catch (err) {
    console.log("Startup OTA check failed:", err);
  }

  return "ready";
}

export default function App() {
  const [startupOtaReady, setStartupOtaReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && startupOtaReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, startupOtaReady]);

  useEffect(() => {
    let active = true;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      if (active) {
        console.log(
          `Startup OTA check timed out after ${STARTUP_OTA_TIMEOUT_MS}ms; continuing with embedded bundle`,
        );
        setStartupOtaReady(true);
      }
    }, STARTUP_OTA_TIMEOUT_MS);

    const finish = () => {
      if (!active || timedOut) return;
      clearTimeout(timeout);
      setStartupOtaReady(true);
    };

    applyStartupOtaUpdate(() => active && !timedOut)
      .then((result) => {
        if (result !== "reloading") finish();
      })
      .catch((err) => {
        console.log("Startup OTA gate failed:", err);
        finish();
      });

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!startupOtaReady) return;

    const initFacebookSDK = async () => {
      if (Platform.OS === "web") return;
      try {
        const Constants = await import("expo-constants");
        const isExpoGo = Constants.default?.appOwnership === "expo";
        if (isExpoGo) return;

        let trackingGranted = false;
        try {
          if (Platform.OS === "ios") {
            const { requestTrackingPermissionsAsync } = await import(
              "expo-tracking-transparency"
            );
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
            timeToWaitForATTUserAuthorization: 60,
          },
          () => {
            console.log("AppsFlyer initialized");
          },
          (error: any) => {
            console.log("AppsFlyer init error:", error);
          },
        );
      } catch (error) {
        console.log("AppsFlyer init failed:", error);
      }
    };

    initFacebookSDK();
    initFirebaseAnalytics();
    initAppsFlyer();
  }, [startupOtaReady]);

  if (!startupOtaReady || (!fontsLoaded && !fontError)) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <ThemeProvider>
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
