import React, { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Text, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

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
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      
      if (photo?.uri) {
        setCapturedImage(photo.uri);
        analyzeImage(photo.base64 || "");
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      analyzeImage(result.assets[0].base64 || "");
    }
  };

  const analyzeImage = async (base64: string) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    
    try {
      const response = await apiRequest("POST", "/api/analyze-image", {
        imageBase64: base64,
      });
      const result = await response.json();
      setAnalysisResult(result);
      
      if (result.productName) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setAnalysisResult({ error: "Failed to analyze image" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSearchEbay = async () => {
    if (!analysisResult?.productName) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAnalyzing(true);
    
    try {
      const searchQuery = [
        analysisResult.brand,
        analysisResult.productName,
        analysisResult.model,
      ].filter(Boolean).join(" ");
      
      const response = await apiRequest("POST", "/api/search", { query: searchQuery });
      const results = await response.json();

      const historyItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: searchQuery,
        product: results.listings?.[0] || null,
        searchedAt: new Date().toISOString(),
        results: results,
      };

      await addSearchHistory(historyItem);
      navigation.navigate("SearchResults", { results });
    } catch (error) {
      console.error("Search failed:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setAnalysisResult(null);
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.foreground }}>Loading camera...</Text>
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

  if (capturedImage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.previewContainer, { paddingTop: insets.top }]}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.previewImage}
            contentFit="contain"
          />
        </View>
        
        <View style={[styles.resultContainer, { backgroundColor: theme.colors.card }]}>
          {isAnalyzing ? (
            <View style={styles.analyzingContainer}>
              <Feather name="loader" size={24} color={theme.colors.primary} />
              <Text style={[styles.analyzingText, { color: theme.colors.foreground }]}>
                Identifying product...
              </Text>
            </View>
          ) : analysisResult?.productName ? (
            <View style={styles.resultContent}>
              <View style={[styles.successBadge, { backgroundColor: theme.colors.successBackground }]}>
                <Feather name="check" size={16} color={theme.colors.success} />
                <Text style={[styles.successText, { color: theme.colors.success }]}>
                  Product Identified
                </Text>
              </View>
              
              <Text style={[styles.productName, { color: theme.colors.foreground }]}>
                {analysisResult.brand ? `${analysisResult.brand} ` : ""}
                {analysisResult.productName}
                {analysisResult.model ? ` ${analysisResult.model}` : ""}
              </Text>
              
              {analysisResult.category ? (
                <Text style={[styles.category, { color: theme.colors.mutedForeground }]}>
                  Category: {analysisResult.category}
                </Text>
              ) : null}
              
              <View style={styles.actionButtons}>
                <Pressable
                  onPress={handleRetake}
                  style={({ pressed }) => [
                    styles.retakeButton,
                    { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
                  ]}
                >
                  <Feather name="camera" size={18} color={theme.colors.foreground} />
                  <Text style={[styles.retakeButtonText, { color: theme.colors.foreground }]}>
                    Retake
                  </Text>
                </Pressable>
                
                <Pressable
                  onPress={handleSearchEbay}
                  disabled={isAnalyzing}
                  style={({ pressed }) => [
                    styles.searchButton,
                    { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
                  ]}
                >
                  <Feather name="search" size={18} color={colors.light.primaryForeground} />
                  <Text style={styles.searchButtonText}>Search eBay</Text>
                </Pressable>
              </View>
            </View>
          ) : analysisResult?.error ? (
            <View style={styles.resultContent}>
              <Text style={[styles.errorText, { color: theme.colors.danger }]}>
                {analysisResult.error}
              </Text>
              <Pressable
                onPress={handleRetake}
                style={({ pressed }) => [
                  styles.retakeButton,
                  { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1, marginTop: 16 }
                ]}
              >
                <Feather name="camera" size={18} color={theme.colors.foreground} />
                <Text style={[styles.retakeButtonText, { color: theme.colors.foreground }]}>
                  Try Again
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (Platform.OS === "web") {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Feather name="camera" size={64} color={theme.colors.mutedForeground} />
        <Text style={[styles.permissionTitle, { color: theme.colors.foreground }]}>
          Camera Scan
        </Text>
        <Text style={[styles.permissionMessage, { color: theme.colors.mutedForeground }]}>
          Use Expo Go on your phone to scan products with your camera
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
              Point at a product to identify it
            </Text>
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
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
  },
  resultContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 200,
  },
  analyzingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  analyzingText: {
    fontSize: 16,
    fontWeight: "500",
  },
  resultContent: {
    alignItems: "center",
  },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    fontWeight: "600",
  },
  productName: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  category: {
    fontSize: 14,
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
  },
  retakeButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    gap: 8,
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
  },
});
