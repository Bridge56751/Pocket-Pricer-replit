import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { RootStackParamList, CapturedPhoto } from "@/navigation/RootStackNavigator";

const MAX_IMAGE_SIZE = 750;
const IMAGE_QUALITY = 0.6;

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

export default function CameraScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const hasLaunched = useRef(false);
  const [statusText, setStatusText] = useState("Opening camera...");

  useEffect(() => {
    if (!hasLaunched.current) {
      hasLaunched.current = true;
      launchCamera();
    }
  }, []);

  const launchCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== "granted") {
        navigation.goBack();
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: IMAGE_QUALITY,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setStatusText("Preparing image...");
        const resized = await resizeImage(result.assets[0].uri);
        if (resized) {
          navigation.navigate("Home", { photosToProcess: [resized] });
          return;
        }
      }
      navigation.goBack();
    } catch (error) {
      console.error("Camera launch error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.loadingText, { color: theme.colors.mutedForeground }]}>
        {statusText}
      </Text>
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
  loadingText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
