import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import {
  BottomTabBar,
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScanScreen from "@/screens/ScanScreen";
import InventoryScreen from "@/screens/InventoryScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import CalculatorScreen from "@/screens/CalculatorScreen";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useTabBarVisibility } from "@/contexts/TabBarVisibilityContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRevenueCat } from "@/contexts/RevenueCatContext";
import { FREE_SCAN_LIMIT } from "@/constants/scan-limits";
import type { CapturedPhoto } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  Home:
    | {
        photosToProcess?: CapturedPhoto[];
        prefillQuery?: string;
        addToInventory?: boolean;
      }
    | undefined;
  Calculator: undefined;
  Camera: undefined;
  Inventory: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function CameraTabPlaceholder() {
  return <View />;
}

function AnimatedTabBar({
  tabBarHeight,
  ...props
}: BottomTabBarProps & { tabBarHeight: number }) {
  const { opacity } = useTabBarVisibility();
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: (1 - opacity.value) * (tabBarHeight + 40) }],
  }));
  return (
    <Animated.View
      style={[styles.animatedTabBarWrap, animatedStyle]}
      pointerEvents="box-none"
    >
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: React.ComponentProps<typeof Feather>["name"];
  color: string;
  size: number;
  focused: boolean;
}) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapFocused]}>
      <Feather name={name} size={focused ? size + 2 : size} color={color} />
    </View>
  );
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
      <View style={styles.cameraTabRing}>
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
      </View>
    </Pressable>
  );
}

export default function MainTabNavigator({ navigation }: any) {
  const { theme } = useDesignTokens();
  const { isPro, isReady: rcReady } = useRevenueCat();
  const { getScansUsed } = useAuth();
  const insets = useSafeAreaInsets();
  const androidBottomInset = Platform.OS === "android" ? insets.bottom : 0;
  const baseTabBarHeight =
    Platform.select({ ios: 88, android: 64, default: 64 }) ?? 64;
  const tabBarHeight = baseTabBarHeight + androidBottomInset;

  const openCamera = async () => {
    if (rcReady && !isPro) {
      const scansUsed = await getScansUsed();
      if (scansUsed >= FREE_SCAN_LIMIT) {
        navigation.navigate("Paywall");
        return;
      }
    }
    navigation.navigate("MainTabs", { screen: "Home" });
    navigation.navigate("CameraScan", { source: "camera" });
  };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => (
        <AnimatedTabBar {...props} tabBarHeight={tabBarHeight} />
      )}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.foreground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.background,
          borderTopColor: "#047857",
          borderTopWidth: 2,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: androidBottomInset,
          elevation: 0,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Calculator"
        component={CalculatorScreen}
        options={{
          tabBarLabel: "Calculator",
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="percent"
              color={color}
              size={size}
              focused={focused}
            />
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
        component={InventoryScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="package"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="settings"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  animatedTabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraTabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: -20,
  },
  tabIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: 0 }],
  },
  tabIconWrapFocused: {
    transform: [{ translateY: -6 }],
  },
  cameraTabRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#047857",
    shadowColor: "#047857",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cameraTabCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
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
