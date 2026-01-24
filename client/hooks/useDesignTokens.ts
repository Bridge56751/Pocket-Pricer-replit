import { lightTheme, darkTheme, colors } from "@/constants/design-tokens";
import { useColorScheme } from "@/hooks/useColorScheme";

export function useDesignTokens() {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";
  
  const theme = isDarkMode ? darkTheme : lightTheme;
  
  return {
    theme,
    colors,
    isDarkMode,
  };
}
