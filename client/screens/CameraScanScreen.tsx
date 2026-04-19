import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useNavigation, useRoute, RouteProp, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Feather } from "@expo/vector-icons";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { RootStackParamList, PhotoSource } from "@/navigation/RootStackNavigator";

const MAX_IMAGE_SIZE = 750;
const IMAGE_QUALITY = 0.6;

type ScreenState =
  | "checking"
  | "ready"
  | "capturing"
  | "opening-library"
  | "processing"
  | "denied"
  | "blocked";

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
  const initialSource: PhotoSource = route.params?.source ?? "camera";

  const cameraRef = useRef<CameraView>(null);
  const handledLibrary = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [state, setState] = useState<ScreenState>("checking");
  const [activeSource, setActiveSource] = useState<PhotoSource>(initialSource);

  // If launched directly into library mode (e.g. from "Try again" after a library scan),
  // open the library picker immediately and skip the camera UI.
  useEffect(() => {
    if (initialSource === "library" && !handledLibrary.current) {
      handledLibrary.current = true;
      void openLibraryPicker(true);
    } else if (initialSource === "camera") {
      // For camera, ensure we have permission then show the live preview
      void ensureCameraPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check camera permission when screen regains focus (e.g. after returning from Settings)
  useFocusEffect(
    useCallback(() => {
      if (activeSource === "camera" && state !== "ready" && state !== "capturing") {
        void ensureCameraPermission();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeSource])
  );

  const ensureCameraPermission = async () => {
    try {
      let permission = cameraPermission;
      if (!permission) {
        permission = await requestCameraPermission();
      } else if (!permission.granted && permission.canAskAgain) {
        permission = await requestCameraPermission();
      }

      if (permission?.granted) {
        setState("ready");
      } else if (permission?.canAskAgain) {
        setState("denied");
      } else {
        setState("blocked");
      }
    } catch (error) {
      console.error("Camera permission error:", error);
      navigation.goBack();
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || state === "capturing" || state === "processing") return;
    try {
      setState("capturing");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        quality: IMAGE_QUALITY,
        skipProcessing: true,
      });
      if (!photo?.uri) {
        setState("ready");
        return;
      }
      setState("processing");
      const resized = await resizeImage(photo.uri);
      if (resized) {
        navigation.navigate("Home", { photosToProcess: [resized], photoSource: "camera" });
      } else {
        setState("ready");
      }
    } catch (error) {
      console.error("Capture error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setState("ready");
    }
  };

  const openLibraryPicker = async (initialLaunch = false) => {
    try {
      setActiveSource("library");
      setState("opening-library");
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        if (initialLaunch) {
          // For initial library launch, fall back to permission UI
          setState(canAskAgain ? "denied" : "blocked");
          return;
        }
        // From within camera: just return to camera view, OS already showed denial
        setActiveSource("camera");
        setState("ready");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: IMAGE_QUALITY,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        if (initialLaunch) {
          navigation.goBack();
        } else {
          setActiveSource("camera");
          setState("ready");
        }
        return;
      }

      setState("processing");
      const resized = await resizeImage(result.assets[0].uri);
      if (resized) {
        navigation.navigate("Home", { photosToProcess: [resized], photoSource: "library" });
      } else if (initialLaunch) {
        navigation.goBack();
      } else {
        setActiveSource("camera");
        setState("ready");
      }
    } catch (error) {
      console.error("Library picker error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (initialLaunch) {
        navigation.goBack();
      } else {
        setActiveSource("camera");
        setState("ready");
      }
    }
  };

  const handleRequestPermission = async () => {
    if (activeSource === "camera") {
      await ensureCameraPermission();
    } else {
      await openLibraryPicker(true);
    }
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

  // ---------- Render: loading / processing overlays ----------
  if (state === "checking" || state === "opening-library" || state === "processing") {
    const label =
      state === "processing"
        ? "Preparing image..."
        : state === "opening-library"
        ? "Opening photos..."
        : "Loading camera...";
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.statusText, { color: theme.colors.mutedForeground }]}>{label}</Text>
      </View>
    );
  }

  // ---------- Render: permission gate ----------
  if (state === "denied" || state === "blocked") {
    const isLibrary = activeSource === "library";
    const permissionTitle = isLibrary ? "Photo Access Needed" : "Camera Access Needed";
    const permissionBody = isLibrary
      ? "Pocket Pricer accesses your photo library so you can select product images to scan. For example, choose a saved photo of an item to instantly see what it sells for online."
      : "Pocket Pricer uses your camera to take photos of products so it can identify them and show you current prices across stores like Amazon, Walmart, and Target. For example, you can photograph a pair of shoes to instantly see what they sell for online.";
    const blockedNote = isLibrary
      ? "Photo access was denied. To enable it, go to Settings → Pocket Pricer → Photos and turn it on."
      : "Camera access was denied. To enable it, go to Settings → Pocket Pricer → Camera and turn it on.";
    const allowButtonLabel = isLibrary ? "Allow Photo Access" : "Allow Camera Access";
    const iconName: React.ComponentProps<typeof Feather>["name"] = isLibrary ? "image" : "camera";

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
          style={[styles.permissionClose, { top: insets.top + 12 }]}
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
            <Text style={[styles.cancelText, { color: theme.colors.mutedForeground }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---------- Render: live camera with library shortcut ----------
  return (
    <View style={styles.cameraRoot}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          testID="camera-close"
          style={({ pressed }) => [styles.topButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="x" size={24} color="#fff" />
        </Pressable>
        <View style={styles.topTitleWrap}>
          <Text style={styles.topTitle}>Scan Product</Text>
          <Text style={styles.topSubtitle}>Center the item in frame</Text>
        </View>
        <View style={styles.topButton} />
      </View>

      {/* Framing guide */}
      <View style={styles.framingGuideWrap} pointerEvents="none">
        <View style={styles.framingGuide} />
      </View>

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => openLibraryPicker(false)}
          accessibilityRole="button"
          accessibilityLabel="Choose photo from library"
          testID="camera-library-button"
          hitSlop={12}
          style={({ pressed }) => [styles.libraryButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="image" size={26} color="#fff" />
          <Text style={styles.libraryButtonLabel}>Library</Text>
        </Pressable>

        <Pressable
          onPress={handleCapture}
          disabled={state === "capturing"}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          testID="camera-capture-button"
          style={({ pressed }) => [styles.shutterOuter, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={styles.shutterInner}>
            {state === "capturing" ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : null}
          </View>
        </Pressable>

        <View style={styles.libraryButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
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
  permissionClose: {
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

  // Camera UI
  cameraRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 5,
  },
  topButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitleWrap: {
    alignItems: "center",
    flex: 1,
  },
  topTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  topSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    marginTop: 2,
  },
  framingGuideWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  framingGuide: {
    width: "75%",
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  libraryButton: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  libraryButtonLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
