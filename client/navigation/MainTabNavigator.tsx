import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import ScanScreen from "@/screens/ScanScreen";
import FavoritesScreen from "@/screens/FavoritesScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { CapturedPhoto } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  Batch: undefined;
  Home: { photosToProcess?: CapturedPhoto[]; prefillQuery?: string } | undefined;
  Camera: undefined;
  Inventory: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CameraTabPlaceholder() {
  return <View />;
}

function CameraTabButton({ onCameraPress }: { onCameraPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onCameraPress();
      }}
      style={styles.cameraTabButton}
      testID="tab-camera"
    >
      <LinearGradient
        colors={["#0E7C4A", "#047857", "#065F46"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cameraTabCircle}
      >
        <Feather
          name="camera"
          size={30}
          color="#FFFFFF"
          style={styles.cameraIcon}
        />
      </LinearGradient>
    </Pressable>
  );
}

export default function MainTabNavigator({ navigation }: any) {
  const { theme } = useDesignTokens();

  const openCamera = () => {
    navigation.navigate("CameraScan", { source: "camera" });
  };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: "#047857",
          borderTopWidth: 2,
          height: Platform.select({ ios: 88, android: 64, default: 64 }),
          paddingTop: 6,
        },
      }}
    >
      <Tab.Screen
        name="Batch"
        component={CameraTabPlaceholder}
        options={{
          tabBarLabel: "Batch",
          tabBarIcon: ({ color, size }) => (
            <Feather name="layers" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tab.Screen
        name="Home"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Camera"
        component={CameraTabPlaceholder}
        options={{
          tabBarLabel: "",
          tabBarButton: () => <CameraTabButton onCameraPress={openCamera} />,
          tabBarItemStyle: {
            height: 70,
          },
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openCamera();
          },
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={FavoritesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="package" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  cameraTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: -20,
  },
  cameraTabCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#047857",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
  cameraIcon: {
    width: 30,
    height: 30,
    lineHeight: 30,
    textAlign: "center",
    textAlignVertical: "center",
    includeFontPadding: false,
  },
});
