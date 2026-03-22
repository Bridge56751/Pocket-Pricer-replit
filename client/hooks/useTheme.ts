import { Colors } from "@/constants/design-tokens";

export function useTheme() {
  return {
    theme: Colors.light,
    isDark: false,
  };
}
