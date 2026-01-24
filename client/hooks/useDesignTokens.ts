import { lightTheme, darkTheme, colors } from "@/constants/design-tokens";
import { useThemeContext } from "@/contexts/ThemeContext";

export function useDesignTokens() {
  const { isDarkMode, themeMode, setThemeMode } = useThemeContext();
  
  const theme = isDarkMode ? darkTheme : lightTheme;
  
  return {
    theme,
    colors,
    isDarkMode,
    themeMode,
    setThemeMode,
  };
}
