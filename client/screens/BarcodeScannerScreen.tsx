import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions, BarcodeScanningResult } from "expo-camera";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { addSearchHistory } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { Product, SearchHistoryItem } from "@/types/product";

export default function BarcodeScannerScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webMessage}>
          <Feather name="camera-off" size={64} color={theme.textSecondary} />
          <ThemedText style={styles.webTitle}>Camera Not Available</ThemedText>
          <ThemedText style={[styles.webSubtitle, { color: theme.textSecondary }]}>
            Run in Expo Go on your mobile device to use the barcode scanner
          </ThemedText>
          <Button onPress={() => navigation.goBack()} style={styles.backButton}>
            Go Back
          </Button>
        </View>
      </View>
    );
  }

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]} />;
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.permissionContainer}>
            <Feather name="camera-off" size={64} color={theme.textSecondary} />
            <ThemedText style={styles.permissionTitle}>Camera Permission Required</ThemedText>
            <ThemedText style={[styles.permissionText, { color: theme.textSecondary }]}>
              Please enable camera access in your device settings to scan barcodes.
            </ThemedText>
            <Button
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  console.log("Cannot open settings");
                }
              }}
              style={styles.settingsButton}
            >
              Open Settings
            </Button>
            <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
              <ThemedText style={[styles.cancelText, { color: theme.primary }]}>Cancel</ThemedText>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.permissionContainer}>
          <Feather name="camera" size={64} color={theme.primary} />
          <ThemedText style={styles.permissionTitle}>Enable Camera</ThemedText>
          <ThemedText style={[styles.permissionText, { color: theme.textSecondary }]}>
            We need camera access to scan product barcodes and look up prices.
          </ThemedText>
          <Button onPress={requestPermission} style={styles.settingsButton}>
            Grant Permission
          </Button>
          <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
            <ThemedText style={[styles.cancelText, { color: theme.primary }]}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  const handleBarcodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned || isSearching) return;

    setScanned(true);
    setIsSearching(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const response = await apiRequest("POST", "/api/search", { query: result.data });
      const product: Product = await response.json();

      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: result.data,
        product,
        searchedAt: new Date().toISOString(),
      };

      await addSearchHistory(historyItem);
      navigation.replace("ProductDetail", { product });
    } catch (error) {
      console.error("Barcode search failed:", error);
      setScanned(false);
      setIsSearching(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      >
        <View style={styles.overlay}>
          <View style={[styles.overlayTop, styles.overlaySection]} />
          <View style={styles.middleRow}>
            <View style={[styles.overlaySide, styles.overlaySection]} />
            <View style={styles.scanArea}>
              <View style={[styles.corner, styles.topLeft, { borderColor: theme.primary }]} />
              <View style={[styles.corner, styles.topRight, { borderColor: theme.primary }]} />
              <View style={[styles.corner, styles.bottomLeft, { borderColor: theme.primary }]} />
              <View style={[styles.corner, styles.bottomRight, { borderColor: theme.primary }]} />
            </View>
            <View style={[styles.overlaySide, styles.overlaySection]} />
          </View>
          <View style={[styles.overlayBottom, styles.overlaySection]}>
            <ThemedText style={styles.instructions}>
              {isSearching ? "Searching..." : "Point camera at barcode"}
            </ThemedText>
          </View>
        </View>
      </CameraView>

      <Pressable
        style={[styles.closeButton, { top: insets.top + Spacing.md }]}
        onPress={() => navigation.goBack()}
      >
        <Feather name="x" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlaySection: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  overlayTop: {
    flex: 1,
  },
  middleRow: {
    flexDirection: "row",
  },
  overlaySide: {
    flex: 1,
  },
  scanArea: {
    width: 280,
    height: 180,
    position: "relative",
  },
  overlayBottom: {
    flex: 1,
    alignItems: "center",
    paddingTop: Spacing["2xl"],
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: BorderRadius.sm,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: BorderRadius.sm,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: BorderRadius.sm,
  },
  instructions: {
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
  },
  closeButton: {
    position: "absolute",
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  webMessage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  webTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  webSubtitle: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  backButton: {
    minWidth: 200,
  },
  permissionContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  settingsButton: {
    minWidth: 200,
  },
  cancelLink: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
