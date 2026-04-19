import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Pressable,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Feather } from "@expo/vector-icons";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { RootStackParamList, PhotoSource } from "@/navigation/RootStackNavigator";

const MAX_IMAGE_SIZE = 750;
const IMAGE_QUALITY = 0.6;

type ScreenState = "checking" | "launching" | "denied" | "blocked" | "processing";

const resizeImage = async (uri: string): Promise<{ uri: string; base64: string } | null> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_SIZE } }],
      { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result.base64 ? { uri: result.uri, base64: result.base64 } : null;
  } catch (error) {
    console.error("Failed to resize image:", error);
    return null;
  }
};

type Route = RouteProp<RootStackParamList, "CameraScan">;

export default function CameraScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const source: PhotoSource = route.params?.source ?? "camera";
  const isLibrary = source === "library";

  const hasLaunched = useRef(false);
  const [state, setState] = useState<ScreenState>("checking");

  useEffect(() => {
    if (!hasLaunched.current) {
      hasLaunched.current = true;
      checkAndLaunch();
    }
  }, []);

  const checkAndLaunch = async () => {
    try {
      const { status, canAskAgain } = isLibrary
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();

      if (status === "granted") {
        setState("launching");
        await openPicker();
      } else if (canAskAgain) {
        setState("denied");
      } else {
        setState("blocked");
      }
    } catch (error) {
      console.error("Permission check error:", error);
      navigation.goBack();
    }
  };

  const openPicker = async () => {
    try {
      const result = isLibrary
        ? await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: IMAGE_QUALITY,
            selectionLimit: 1,
          })
        : await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: IMAGE_QUALITY,
          });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setState("processing");
        const resized = await resizeImage(result.assets[0].uri);
        if (resized) {
          navigation.navigate("Home", { photosToProcess: [resized], photoSource: source });
          return;
        }
      }
      navigation.goBack();
    } catch (error) {
      console.error("Picker launch error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      navigation.goBack();
    }
  };

  const handleRequestPermission = async () => {
    setState("checking");
    hasLaunched.current = false;
    await checkAndLaunch();
  };

  const handleOpenSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch {
        navigation.goBack();
      }
    }
  };

  const launchingLabel = isLibrary ? "Opening photos..." : "Opening camera...";
  const permissionTitle = isLibrary ? "Photo Access Needed" : "Camera Access Needed";
  const permissionBody = isLibrary
    ? "Pocket Pricer accesses your photo library so you can select product images to scan. For example, choose a saved photo of an item to instantly see what it sells for online."
    : "Pocket Pricer uses your camera to take photos of products so it can identify them and show you current prices across stores like Amazon, Walmart, and Target. For example, you can photograph a pair of shoes to instantly see what they sell for online.";
  const blockedNote = isLibrary
    ? "Photo access was denied. To enable it, go to Settings → Pocket Pricer → Photos and turn it on."
    : "Camera access was denied. To enable it, go to Settings → Pocket Pricer → Camera and turn it on.";
  const allowButtonLabel = isLibrary ? "Allow Photo Access" : "Allow Camera Access";
  const iconName: React.ComponentProps<typeof Feather>["name"] = isLibrary ? "image" : "camera";

  if (state === "checking" || state === "launching" || state === "processing") {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>
          {state === "processing" ? "Preparing image..." : launchingLabel}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.permissionContainer,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <Pressable
        onPress={() => navigation.goBack()}
        style={[styles.backButton, { top: insets.top + 12 }]}
        hitSlop={12}
      >
        <Feather name="x" size={24} color={theme.colors.foreground} />
      </Pressable>

      <View style={styles.permissionContent}>
        <View style={[styles.iconCircle, { backgroundColor: theme.colors.primary + "18" }]}>
          <View style={[styles.iconCircleInner, { backgroundColor: theme.colors.primary + "28" }]}>
            <Feather name={iconName} size={40} color={theme.colors.primary} />
          </View>
        </View>

        <Text style={[styles.permissionTitle, { color: theme.colors.foreground }]}>
          {permissionTitle}
        </Text>

        <Text style={[styles.permissionBody, { color: theme.colors.mutedForeground }]}>
          {permissionBody}
        </Text>

        {state === "blocked" ? (
          <>
            <Text style={[styles.blockedNote, { color: theme.colors.mutedForeground }]}>
              {blockedNote}
            </Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              onPress={handleOpenSettings}
            >
              <Feather name="settings" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Open Settings</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleRequestPermission}
          >
            <Feather name={iconName} size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>{allowButtonLabel}</Text>
          </Pressable>
        )}

        <Pressable onPress={() => navigation.goBack()} style={styles.cancelButton}>
          <Text style={[styles.cancelText, { color: theme.colors.mutedForeground }]}>
            Not now
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  statusText: {
    fontSize: 15,
    fontWeight: "500",
  },
  permissionContainer: {
    flex: 1,
    paddingHorizontal: 28,
  },
  backButton: {
    position: "absolute",
    right: 20,
    padding: 4,
    zIndex: 10,
  },
  permissionContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconCircleInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionTitle: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionBody: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  blockedNote: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    paddingVertical: 18,
    borderRadius: 16,
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
