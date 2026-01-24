import React, { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Text, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { apiRequest } from "@/lib/query-client";
import { addSearchHistory } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SearchHistoryItem } from "@/types/product";

export default function CameraScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const cameraRef = useRef<CameraView>(null);

  const processImage = async (imageUri: string, base64: string) => {
    setIsProcessing(true);
    setProcessingMessage("Identifying product...");
    
    try {
      const analyzeResponse = await apiRequest("POST", "/api/analyze-image", {
        imageBase64: base64,
      });
      const analysisResult = await analyzeResponse.json();
      
      if (!analysisResult.productName) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setProcessingMessage("Could not identify product. Try again.");
        setTimeout(() => {
          setIsProcessing(false);
          setProcessingMessage("");
        }, 1500);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProcessingMessage("Searching eBay listings...");

      const searchQuery = [
        analysisResult.brand,
        analysisResult.productName,
        analysisResult.model,
      ].filter(Boolean).join(" ");
      
      const searchResponse = await apiRequest("POST", "/api/search", { query: searchQuery });
      const results = await searchResponse.json();

      const enrichedResults = {
        ...results,
        scannedImageUri: imageUri,
        productInfo: {
          name: analysisResult.productName,
          brand: analysisResult.brand,
          category: analysisResult.category,
          description: analysisResult.description,
        },
      };

      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: searchQuery,
        product: results.listings?.[0] || null,
        searchedAt: new Date().toISOString(),
        results: enrichedResults,
      };

      await addSearchHistory(historyItem);
      setIsProcessing(false);
      setProcessingMessage("");
      navigation.navigate("SearchResults", { results: enrichedResults });
    } catch (error) {
      console.error("Processing failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setProcessingMessage("Something went wrong. Try again.");
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 1500);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      
      if (photo?.uri && photo?.base64) {
        processImage(photo.uri, photo.base64);
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handlePickImage = async () => {
    if (isProcessing) return;
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.uri && asset.base64) {
        processImage(asset.uri, asset.base64);
      }
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Feather name="camera-off" size={64} color={theme.colors.mutedForeground} />
        <Text style={[styles.permissionTitle, { color: theme.colors.foreground }]}>
          Camera Access Required
        </Text>
        <Text style={[styles.permissionMessage, { color: theme.colors.mutedForeground }]}>
          We need camera access to scan products and find eBay listings
        </Text>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [
            styles.enableButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={styles.enableButtonText}>Enable Camera</Text>
        </Pressable>
        
        <Pressable
          onPress={handlePickImage}
          style={({ pressed }) => [
            styles.galleryButton,
            { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Feather name="image" size={18} color={theme.colors.foreground} />
          <Text style={[styles.galleryButtonText, { color: theme.colors.foreground }]}>
            Choose from Gallery
          </Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        {isProcessing ? (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.processingText, { color: theme.colors.foreground }]}>
              {processingMessage}
            </Text>
          </View>
        ) : (
          <>
            <Feather name="camera" size={64} color={theme.colors.mutedForeground} />
            <Text style={[styles.permissionTitle, { color: theme.colors.foreground }]}>
              Scan Product
            </Text>
            <Text style={[styles.permissionMessage, { color: theme.colors.mutedForeground }]}>
              Use Expo Go on your phone for camera scanning, or choose an image from your gallery
            </Text>
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.enableButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="image" size={18} color={colors.light.primaryForeground} style={{ marginRight: 8 }} />
              <Text style={styles.enableButtonText}>Choose from Gallery</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      >
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <Text style={styles.instructions}>
              Point at a product and tap to scan
            </Text>
          </View>
          
          <View style={styles.scanFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>

          {isProcessing ? (
            <View style={[styles.processingBar, { paddingBottom: insets.bottom + 40 }]}>
              <View style={styles.processingContent}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.processingBarText}>{processingMessage}</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
              <Pressable
                onPress={handlePickImage}
                style={({ pressed }) => [
                  styles.galleryIcon,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="image" size={28} color="#fff" />
              </Pressable>
              
              <Pressable
                onPress={handleCapture}
                style={({ pressed }) => [
                  styles.captureButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <View style={styles.captureButtonInner} />
              </Pressable>
              
              <View style={styles.placeholder} />
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    alignItems: "center",
    paddingVertical: 20,
  },
  instructions: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  scanFrame: {
    width: 280,
    height: 280,
    alignSelf: "center",
    position: "relative",
  },
  cornerTL: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#10B981",
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 40,
    height: 40,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "#10B981",
    borderTopRightRadius: 12,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "#10B981",
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "#10B981",
    borderBottomRightRadius: 12,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 40,
  },
  processingBar: {
    alignItems: "center",
    justifyContent: "center",
  },
  processingContent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 10,
  },
  processingBarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  galleryIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
  },
  placeholder: {
    width: 56,
    height: 56,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: 20,
    marginBottom: 8,
    textAlign: "center",
  },
  permissionMessage: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  enableButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  enableButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  galleryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 12,
    gap: 8,
  },
  galleryButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  processingOverlay: {
    alignItems: "center",
    gap: 16,
  },
  processingText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
