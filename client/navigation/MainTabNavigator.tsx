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
  Inventory: undefined;
  Scan: { photosToProcess?: CapturedPhoto[]; prefillQuery?: string } | undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function ScanTabButton({ children, onPress, accessibilityState }: any) {
  const focused = accessibilityState?.selected;
  return (
    <Pressable
      onPress={(e) => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.(e);
      }}
      style={styles.scanTabButton}
      testID="tab-scan"
    >
      <LinearGradient
        colors={focused ? ["#0E7C4A", "#047857", "#065F46"] : ["#0E7C4A", "#047857", "#065F46"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.scanTabCircle}
      >
        {children}
      </LinearGradient>
    </Pressable>
  );
}

export default function MainTabNavigator() {
  const { theme } = useDesignTokens();

  return (
    <Tab.Navigator
      initialRouteName="Scan"
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
          borderTopColor: "rgba(0,0,0,0.06)",
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.select({ ios: 88, android: 64, default: 64 }),
          paddingTop: 6,
        },
      }}
    >
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
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarLabel: "",
          tabBarIcon: () => <Feather name="camera" size={26} color="#FFFFFF" />,
          tabBarButton: (props) => <ScanTabButton {...props} />,
          tabBarItemStyle: {
            height: 70,
          },
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
  scanTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: -16,
  },
  scanTabCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
});
