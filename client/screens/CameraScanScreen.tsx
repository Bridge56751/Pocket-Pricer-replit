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
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { apiRequest } from "@/lib/query-client";
import { addSearchHistory } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SearchHistoryItem } from "@/types/product";

interface ScanResult {
  productName: string;
  price: number;
  imageUri: string;
}

export default function CameraScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [scanCount, setScanCount] = useState(0);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  
  const flashOpacity = useSharedValue(0);
  const flashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const triggerFlash = () => {
    flashOpacity.value = 1;
    flashOpacity.value = withTiming(0, { duration: 150 });
  };

  const returnToCamera = () => {
    setCapturedPhoto(null);
  };

  const processImage = async (imageUri: string, base64: string) => {
    setCapturedPhoto(imageUri);
    setIsProcessing(true);
    setProcessingMessage("Identifying product...");
    setLastScan(null);
    
    try {
      const analyzeResponse = await apiRequest("POST", "/api/analyze-image", {
        imageBase64: base64,
      });
      const analysisResult = await analyzeResponse.json();
      
      if (!analysisResult.productName) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setProcessingMessage("Could not identify. Try again.");
        setTimeout(() => {
          setIsProcessing(false);
          setProcessingMessage("");
          setCapturedPhoto(null);
        }, 1500);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setProcessingMessage("Searching eBay...");

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
      
      setScanCount(prev => prev + 1);
      setLastScan({
        productName: analysisResult.productName,
        price: results.avgListPrice || 0,
        imageUri: imageUri,
      });
      setIsProcessing(false);
      setProcessingMessage("");
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
    } catch (error) {
      console.error("Processing failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setProcessingMessage("Something went wrong.");
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
        setCapturedPhoto(null);
      }, 1500);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing || capturedPhoto) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerFlash();
    
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

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.goBack();
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
        ) : lastScan ? (
          <View style={styles.successOverlay}>
            <Feather name="check-circle" size={48} color={theme.colors.primary} />
            <Text style={[styles.successTitle, { color: theme.colors.foreground }]}>
              {lastScan.productName}
            </Text>
            <Text style={[styles.successPrice, { color: theme.colors.primary }]}>
              ~${lastScan.price.toFixed(0)}
            </Text>
            <Text style={[styles.successNote, { color: theme.colors.mutedForeground }]}>
              Saved! Pick another image or tap Done.
            </Text>
            <View style={styles.webButtons}>
              <Pressable
                onPress={handlePickImage}
                style={({ pressed }) => [
                  styles.webButton,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="image" size={18} color={theme.colors.foreground} />
                <Text style={[styles.webButtonText, { color: theme.colors.foreground }]}>
                  Scan Another
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDone}
                style={({ pressed }) => [
                  styles.webButton,
                  { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={styles.doneButtonText}>Done ({scanCount})</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Feather name="camera" size={64} color={theme.colors.mutedForeground} />
            <Text style={[styles.permissionTitle, { color: theme.colors.foreground }]}>
              Scan Products
            </Text>
            <Text style={[styles.permissionMessage, { color: theme.colors.mutedForeground }]}>
              Choose images from your gallery to scan multiple products
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
            {scanCount > 0 ? (
              <Pressable
                onPress={handleDone}
                style={({ pressed }) => [
                  styles.galleryButton,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={[styles.galleryButtonText, { color: theme.colors.foreground }]}>
                  Done ({scanCount} scanned)
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      {capturedPhoto ? (
        <View style={styles.capturedPhotoContainer}>
          <Image
            source={{ uri: capturedPhoto }}
            style={styles.capturedPhoto}
            contentFit="cover"
          />
          <View style={[styles.overlay, { paddingTop: insets.top }]}>
            <View style={styles.topBar}>
              <View style={styles.scanCountBadge}>
                <Feather name="check" size={14} color="#fff" />
                <Text style={styles.scanCountText}>{scanCount} scanned</Text>
              </View>
            </View>

            {lastScan ? (
              <View style={styles.resultCard}>
                <Feather name="check-circle" size={32} color="#10B981" />
                <Text style={styles.resultTitle} numberOfLines={2}>
                  {lastScan.productName}
                </Text>
                <Text style={styles.resultPrice}>
                  ~${lastScan.price.toFixed(0)}
                </Text>
              </View>
            ) : (
              <View style={styles.processingCard}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.processingCardText}>{processingMessage}</Text>
              </View>
            )}

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
              {lastScan ? (
                <>
                  <Pressable
                    onPress={returnToCamera}
                    style={({ pressed }) => [
                      styles.scanAnotherButton,
                      { opacity: pressed ? 0.7 : 1 }
                    ]}
                  >
                    <Feather name="camera" size={20} color="#fff" />
                    <Text style={styles.scanAnotherText}>Scan Another</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDone}
                    style={({ pressed }) => [
                      styles.finishButton,
                      { opacity: pressed ? 0.7 : 1 }
                    ]}
                  >
                    <Text style={styles.finishText}>Done</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          <Animated.View style={[styles.flashOverlay, flashAnimatedStyle]} />
          <View style={[styles.overlay, { paddingTop: insets.top }]}>
            <View style={styles.topBar}>
              {scanCount > 0 ? (
                <View style={styles.scanCountBadge}>
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={styles.scanCountText}>{scanCount} scanned</Text>
                </View>
              ) : (
                <Text style={styles.instructions}>
                  Point at a product and tap to scan
                </Text>
              )}
            </View>
            
            <View style={styles.scanFrame}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>

            <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
              <Pressable
                onPress={handlePickImage}
                style={({ pressed }) => [
                  styles.sideButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="image" size={24} color="#fff" />
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
              
              <Pressable
                onPress={handleDone}
                style={({ pressed }) => [
                  styles.sideButton,
                  styles.doneButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </CameraView>
      )}
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
  scanCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  scanCountText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
  successToast: {
    position: "absolute",
    bottom: 140,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    gap: 12,
  },
  toastImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  toastContent: {
    flex: 1,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  toastPrice: {
    fontSize: 18,
    fontWeight: "700",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 30,
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
  sideButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButton: {
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    borderRadius: 28,
  },
  doneText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
  successOverlay: {
    alignItems: "center",
    gap: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  successPrice: {
    fontSize: 32,
    fontWeight: "700",
  },
  successNote: {
    fontSize: 14,
    marginBottom: 16,
  },
  webButtons: {
    flexDirection: "row",
    gap: 12,
  },
  webButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
  },
  webButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  capturedPhotoContainer: {
    flex: 1,
  },
  capturedPhoto: {
    ...StyleSheet.absoluteFillObject,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 10,
  },
  resultCard: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    marginHorizontal: 40,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  resultTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  resultPrice: {
    color: "#10B981",
    fontSize: 36,
    fontWeight: "700",
  },
  processingCard: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    marginHorizontal: 40,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 16,
  },
  processingCardText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  scanAnotherButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
  },
  scanAnotherText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  finishButton: {
    backgroundColor: "#10B981",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
  },
  finishText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
