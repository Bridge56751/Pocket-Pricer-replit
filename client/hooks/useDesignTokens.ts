import { lightTheme, colors } from "@/constants/design-tokens";

export function useDesignTokens() {
  return {
    theme: lightTheme,
    colors,
    isDarkMode: false,
  };
}
