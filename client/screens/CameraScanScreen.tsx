import React, { useState, useRef } from "react";
import { View, StyleSheet, Pressable, Text, Platform, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { apiRequest } from "@/lib/query-client";
import { addSearchHistory } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SearchHistoryItem } from "@/types/product";

interface CapturedPhoto {
  uri: string;
  base64: string;
}

export default function CameraScanScreen() {
  const insets = useSafeAreaInsets();
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  
  const flashOpacity = useSharedValue(0);
  const flashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const triggerFlash = () => {
    flashOpacity.value = 1;
    flashOpacity.value = withTiming(0, { duration: 150 });
  };

  const processAllPhotos = async () => {
    if (capturedPhotos.length === 0) return;
    
    setIsProcessing(true);
    setProcessingIndex(0);
    setProcessedCount(0);
    
    for (let i = 0; i < capturedPhotos.length; i++) {
      setProcessingIndex(i + 1);
      const photo = capturedPhotos[i];
      
      try {
        const analyzeResponse = await apiRequest("POST", "/api/analyze-image", {
          imageBase64: photo.base64,
        });
        const analysisResult = await analyzeResponse.json();
        
        if (!analysisResult.productName) {
          setProcessedCount(prev => prev + 1);
          continue;
        }

        const searchQuery = [
          analysisResult.brand,
          analysisResult.productName,
          analysisResult.model,
        ].filter(Boolean).join(" ");
        
        const searchResponse = await apiRequest("POST", "/api/search", { query: searchQuery });
        const results = await searchResponse.json();

        const enrichedResults = {
          ...results,
          scannedImageUri: photo.uri,
          productInfo: {
            name: analysisResult.productName,
            brand: analysisResult.brand,
            category: analysisResult.category,
            description: analysisResult.description,
          },
        };

        const historyItem: SearchHistoryItem = {
          id: Date.now().toString() + i,
          query: searchQuery,
          product: results.listings?.[0] || null,
          searchedAt: new Date().toISOString(),
          results: enrichedResults,
        };

        await addSearchHistory(historyItem);
        setProcessedCount(prev => prev + 1);
        
      } catch (error) {
        console.error("Processing failed for photo", i, error);
        setProcessedCount(prev => prev + 1);
      }
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsProcessing(false);
    navigation.goBack();
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isProcessing) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerFlash();
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      
      if (photo?.uri && photo?.base64) {
        setCapturedPhotos(prev => [...prev, { uri: photo.uri, base64: photo.base64 as string }]);
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
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets) {
      const newPhotos = result.assets
        .filter(asset => asset.uri && asset.base64)
        .map(asset => ({ uri: asset.uri, base64: asset.base64! }));
      setCapturedPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const removePhoto = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCapturedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
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
            styles.primaryButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={styles.primaryButtonText}>Enable Camera</Text>
        </Pressable>
        
        <Pressable
          onPress={handlePickImage}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Feather name="image" size={18} color={theme.colors.foreground} />
          <Text style={[styles.secondaryButtonText, { color: theme.colors.foreground }]}>
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
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.processingTitle, { color: theme.colors.foreground }]}>
              Searching {processingIndex} of {capturedPhotos.length}...
            </Text>
            <View style={[styles.progressBar, { backgroundColor: theme.colors.muted }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: theme.colors.primary,
                    width: `${(processedCount / capturedPhotos.length) * 100}%` 
                  }
                ]} 
              />
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
            
            {capturedPhotos.length > 0 ? (
              <View style={styles.webPhotoGrid}>
                {capturedPhotos.map((photo, index) => (
                  <View key={index} style={styles.webPhotoThumb}>
                    <Image source={{ uri: photo.uri }} style={styles.webPhotoImage} contentFit="cover" />
                    <Pressable 
                      onPress={() => removePhoto(index)}
                      style={styles.webRemoveButton}
                    >
                      <Feather name="x" size={14} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="image" size={18} color={colors.light.primaryForeground} style={{ marginRight: 8 }} />
              <Text style={styles.primaryButtonText}>
                {capturedPhotos.length > 0 ? "Add More Photos" : "Choose Photos"}
              </Text>
            </Pressable>
            
            {capturedPhotos.length > 0 ? (
              <Pressable
                onPress={processAllPhotos}
                style={({ pressed }) => [
                  styles.searchAllButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="search" size={18} color="#fff" />
                <Text style={styles.searchAllText}>
                  Search All ({capturedPhotos.length})
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    );
  }

  if (isProcessing) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: "#000" }]}>
        <View style={styles.processingContainer}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.processingTitle}>
            Searching {processingIndex} of {capturedPhotos.length}...
          </Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${(processedCount / capturedPhotos.length) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.processingSubtitle}>
            Finding eBay listings for your items
          </Text>
        </View>
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
        <Animated.View style={[styles.flashOverlay, flashAnimatedStyle]} />
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <Pressable onPress={handleCancel} style={styles.cancelButton}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            {capturedPhotos.length > 0 ? (
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{capturedPhotos.length} photos</Text>
              </View>
            ) : (
              <Text style={styles.instructions}>
                Take photos of products to scan
              </Text>
            )}
            <View style={{ width: 40 }} />
          </View>

          {capturedPhotos.length > 0 ? (
            <View style={styles.thumbnailStrip}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailScroll}
              >
                {capturedPhotos.map((photo, index) => (
                  <View key={index} style={styles.thumbnailContainer}>
                    <Image 
                      source={{ uri: photo.uri }} 
                      style={styles.thumbnail}
                      contentFit="cover"
                    />
                    <Pressable 
                      onPress={() => removePhoto(index)}
                      style={styles.thumbnailRemove}
                    >
                      <Feather name="x" size={12} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={styles.scanFrame}>
              <View style={styles.cornerTL} />
              <View style={styles.cornerTR} />
              <View style={styles.cornerBL} />
              <View style={styles.cornerBR} />
            </View>
          )}

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
            
            {capturedPhotos.length > 0 ? (
              <Pressable
                onPress={processAllPhotos}
                style={({ pressed }) => [
                  styles.searchButton,
                  { opacity: pressed ? 0.7 : 1 }
                ]}
              >
                <Feather name="search" size={18} color="#fff" />
              </Pressable>
            ) : (
              <View style={styles.sideButton} />
            )}
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
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    zIndex: 10,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  instructions: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  photoBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  photoBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  thumbnailStrip: {
    marginTop: 20,
  },
  thumbnailScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  thumbnailContainer: {
    position: "relative",
    marginRight: 12,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  thumbnailRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 30,
  },
  sideButton: {
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
  searchButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
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
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 12,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  searchAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 16,
    gap: 8,
  },
  searchAllText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  processingContainer: {
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 40,
  },
  processingTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  processingSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    textAlign: "center",
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 3,
  },
  webPhotoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
    maxWidth: 300,
  },
  webPhotoThumb: {
    position: "relative",
  },
  webPhotoImage: {
    width: 70,
    height: 70,
    borderRadius: 10,
  },
  webRemoveButton: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
