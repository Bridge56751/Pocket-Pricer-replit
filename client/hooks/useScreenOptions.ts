import { Platform } from "react-native";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { isLiquidGlassAvailable } from "expo-glass-effect";

import { useDesignTokens } from "@/hooks/useDesignTokens";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = true,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme: designTheme, isDarkMode } = useDesignTokens();

  return {
    headerTitleAlign: "center",
    headerTransparent: transparent,
    headerBlurEffect: isDarkMode ? "dark" : "light",
    headerTintColor: designTheme.colors.foreground,
    headerStyle: {
      backgroundColor: Platform.select({
        ios: undefined,
        android: designTheme.colors.background,
        web: designTheme.colors.background,
      }),
    },
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    contentStyle: {
      backgroundColor: designTheme.colors.background,
    },
  };
}
