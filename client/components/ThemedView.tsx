import { View, type ViewProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  style,
  lightColor,
  ...otherProps
}: ThemedViewProps) {
  const { theme } = useTheme();

  const backgroundColor = lightColor || theme.backgroundRoot;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
