import { Colors } from "@/constants/design-tokens";
import { useColorScheme } from "@/hooks/useColorScheme";

export function useTheme() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = Colors[colorScheme ?? "light"];

  return {
    theme,
    isDark,
  };
}
