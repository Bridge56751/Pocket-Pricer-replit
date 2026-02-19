import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, Text, Platform, ActivityIndicator, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { RootStackParamList, CapturedPhoto } from "@/navigation/RootStackNavigator";

const MAX_IMAGE_SIZE = 750;
const IMAGE_QUALITY = 0.6;
const MAX_PHOTOS = 5;

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

  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (capturedPhotos.length === 0 && !launching) {
      launchCamera();
    }
  }, []);

  const launchCamera = async () => {
    if (launching) return;
    setLaunching(true);

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== "granted") {
        setLaunching(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: IMAGE_QUALITY,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const resized = await resizeImage(result.assets[0].uri);
        if (resized) {
          setCapturedPhotos(prev => [...prev, resized].slice(0, MAX_PHOTOS));
        }
      } else if (capturedPhotos.length === 0) {
        navigation.goBack();
      }
    } catch (error) {
      console.error("Camera launch error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLaunching(false);
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

  const handleSearch = () => {
    if (capturedPhotos.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("Home", { photosToProcess: capturedPhotos });
  };

  const removePhoto = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCapturedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  if (launching && capturedPhotos.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.mutedForeground }]}>
          Opening camera...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color={theme.colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.colors.foreground }]}>
          Scan Products
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {capturedPhotos.length > 0 ? (
        <ScrollView 
          contentContainerStyle={styles.photoGrid}
          showsVerticalScrollIndicator={false}
        >
          {capturedPhotos.map((photo, index) => (
            <View key={index} style={styles.photoCard}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} contentFit="cover" />
              <Pressable
                onPress={() => removePhoto(index)}
                style={({ pressed }) => [styles.removeButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="x" size={16} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.emptyState, { flex: 1 }]}>
          <Feather name="camera" size={48} color={theme.colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: theme.colors.foreground }]}>
            No photos yet
          </Text>
          <Text style={[styles.emptySubtitle, { color: theme.colors.mutedForeground }]}>
            Take a photo or choose from your gallery
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Text style={[styles.photoCount, { color: theme.colors.mutedForeground }]}>
          {capturedPhotos.length}/{MAX_PHOTOS} photos
        </Text>

        <View style={styles.buttonRow}>
          {capturedPhotos.length < MAX_PHOTOS ? (
            <Pressable
              onPress={launchCamera}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="camera" size={20} color={theme.colors.foreground} />
              <Text style={[styles.actionButtonText, { color: theme.colors.foreground }]}>
                Take Photo
              </Text>
            </Pressable>
          ) : null}

          {capturedPhotos.length < MAX_PHOTOS ? (
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: theme.colors.muted, opacity: pressed ? 0.7 : 1 }
              ]}
            >
              <Feather name="image" size={20} color={theme.colors.foreground} />
              <Text style={[styles.actionButtonText, { color: theme.colors.foreground }]}>
                Gallery
              </Text>
            </Pressable>
          ) : null}
        </View>

        {capturedPhotos.length > 0 ? (
          <Pressable
            onPress={handleSearch}
            style={({ pressed }) => [
              styles.searchButton,
              { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }
            ]}
          >
            <Feather name="search" size={20} color="#fff" />
            <Text style={styles.searchButtonText}>
              Search {capturedPhotos.length > 1 ? `All (${capturedPhotos.length})` : "Product"}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "500",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
    justifyContent: "center",
    paddingBottom: 16,
  },
  photoCard: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  removeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
    alignItems: "center",
  },
  photoCount: {
    fontSize: 13,
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    width: "100%",
  },
  searchButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
