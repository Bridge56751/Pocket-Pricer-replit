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
import * as ImageManipulator from "expo-image-manipulator";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { RootStackParamList, CapturedPhoto } from "@/navigation/RootStackNavigator";

const MAX_IMAGE_SIZE = 800;
const IMAGE_QUALITY = 0.5;

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
  const { theme, colors } = useDesignTokens();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const cameraRef = useRef<CameraView>(null);
  
  const flashOpacity = useSharedValue(0);
  const flashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const triggerFlash = () => {
    flashOpacity.value = 1;
    flashOpacity.value = withTiming(0, { duration: 150 });
  };

  const handleSearch = () => {
    if (capturedPhotos.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Home", { photosToProcess: capturedPhotos });
  };

  const MAX_PHOTOS = 5;

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    if (capturedPhotos.length >= MAX_PHOTOS) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerFlash();
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: IMAGE_QUALITY,
      });
      
      if (photo?.uri) {
        const resized = await resizeImage(photo.uri);
        if (resized) {
          setCapturedPhotos(prev => [...prev, resized]);
        }
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== "granted") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: IMAGE_QUALITY,
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets) {
      const resizedPhotos = await Promise.all(
        result.assets
          .filter(asset => asset.uri)
          .slice(0, MAX_PHOTOS - capturedPhotos.length)
          .map(asset => resizeImage(asset.uri))
      );
      const validPhotos = resizedPhotos.filter((p): p is CapturedPhoto => p !== null);
      setCapturedPhotos(prev => [...prev, ...validPhotos].slice(0, MAX_PHOTOS));
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
          We need camera access to scan products and find listings
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
            onPress={handleSearch}
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
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        selectedLens="wide-angle-camera"
      >
          <Animated.View style={[styles.flashOverlay, flashAnimatedStyle]} />
          <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={styles.topBar}>
            <Pressable onPress={handleCancel} style={styles.cancelButton}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            {capturedPhotos.length > 0 ? (
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{capturedPhotos.length}/{MAX_PHOTOS} photos</Text>
              </View>
            ) : (
              <View style={styles.instructionsContainer}>
                <Text style={styles.instructions}>
                  Photograph labels, barcodes, or model numbers
                </Text>
              </View>
            )}
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.scanFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>

          {capturedPhotos.length === 0 ? (
            <View style={styles.tipBanner}>
              <Feather name="info" size={14} color="#10B981" />
              <Text style={styles.tipText}>
                Tip: Labels and barcodes give the best results
              </Text>
            </View>
          ) : null}

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
          ) : null}

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
                onPress={handleSearch}
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
  instructionsContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  instructions: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    paddingHorizontal: 8,
  },
  tipBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
    alignSelf: "center",
    gap: 8,
  },
  tipText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "500",
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
    flexDirection: "row",
  },
  thumbnailContainer: {
    position: "relative",
    marginRight: 4,
  },
  thumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  thumbnailRemove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
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
    width: 50,
    height: 50,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#10B981",
    borderTopLeftRadius: 24,
  },
  cornerTR: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 50,
    height: 50,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#10B981",
    borderTopRightRadius: 24,
  },
  cornerBL: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 50,
    height: 50,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: "#10B981",
    borderBottomLeftRadius: 24,
  },
  cornerBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 50,
    height: 50,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: "#10B981",
    borderBottomRightRadius: 24,
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
