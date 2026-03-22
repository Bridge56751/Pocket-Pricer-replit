import { StyleSheet, Platform } from "react-native";

export const Colors = {
  light: {
    text: "#111827",
    textSecondary: "#6B7280",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: "#047857",
    link: "#047857",
    primary: "#047857",
    danger: "#EF4444",
    success: "#047857",
    successBackground: "#D1FAE5",
    border: "#D1D5DB",
    backgroundRoot: "#F9FAFB",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F3F4F6",
    backgroundTertiary: "#E5E7EB",
  },
  dark: {
    text: "#111827",
    textSecondary: "#6B7280",
    buttonText: "#FFFFFF",
    tabIconDefault: "#9CA3AF",
    tabIconSelected: "#047857",
    link: "#047857",
    primary: "#047857",
    danger: "#EF4444",
    success: "#047857",
    successBackground: "#D1FAE5",
    border: "#D1D5DB",
    backgroundRoot: "#F9FAFB",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F3F4F6",
    backgroundTertiary: "#E5E7EB",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  "3xl": 50,
  full: 9999,
};

export const Typography = {
  display: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "700" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "Inter_400Regular",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
  default: {
    sans: "Inter_400Regular",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
  web: {
    sans: "Inter_400Regular, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    semiBold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
});

export const colors = {
  light: {
    primary: "#047857",
    primaryForeground: "#FFFFFF",
    danger: "#EF4444",
    dangerForeground: "#FFFFFF",
    success: "#047857",
    successBackground: "#D1FAE5",
    warning: "#FBBF24",
    background: "#F9FAFB",
    foreground: "#111827",
    card: "#FFFFFF",
    cardForeground: "#111827",
    muted: "#E5E7EB",
    mutedForeground: "#6B7280",
    border: "#D1D5DB",
    input: "#E5E7EB",
    ring: "#047857",
  },
  dark: {
    primary: "#047857",
    primaryForeground: "#FFFFFF",
    danger: "#EF4444",
    dangerForeground: "#FFFFFF",
    success: "#047857",
    successBackground: "#D1FAE5",
    warning: "#FBBF24",
    background: "#F9FAFB",
    foreground: "#111827",
    card: "#FFFFFF",
    cardForeground: "#111827",
    muted: "#E5E7EB",
    mutedForeground: "#6B7280",
    border: "#D1D5DB",
    input: "#E5E7EB",
    ring: "#047857",
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
};

export const borderRadius = {
  xs: 8,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  "2xl": 40,
  full: 9999,
};

export const typography = {
  display: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: "700" as const,
  },
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
};

const createComponentStyles = (colorScheme: typeof colors.light) =>
  StyleSheet.create({
    card: {
      backgroundColor: colorScheme.card,
      borderRadius: borderRadius.sm,
      padding: spacing.lg,
    },
    cardPressed: {
      backgroundColor: colorScheme.card,
      borderRadius: borderRadius.sm,
      padding: spacing.lg,
      opacity: 0.7,
    },
    input: {
      height: 48,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.xs,
      paddingHorizontal: spacing.lg,
      color: colorScheme.foreground,
      fontSize: 16,
      ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
    },
    inputFocused: {
      height: 48,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.xs,
      paddingHorizontal: spacing.lg,
      color: colorScheme.foreground,
      fontSize: 16,
      borderWidth: 2,
      borderColor: colorScheme.ring,
      ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
    },
  });

const createButtonStyles = (colorScheme: typeof colors.light) =>
  StyleSheet.create({
    primary: {
      height: 52,
      backgroundColor: colorScheme.primary,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
    },
    primaryPressed: {
      height: 52,
      backgroundColor: colorScheme.primary,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
      opacity: 0.7,
    },
    secondary: {
      height: 52,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
    },
    secondaryPressed: {
      height: 52,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
      opacity: 0.7,
    },
    danger: {
      height: 52,
      backgroundColor: colorScheme.danger,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
    },
    dangerPressed: {
      height: 52,
      backgroundColor: colorScheme.danger,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
      opacity: 0.7,
    },
    ghost: {
      height: 52,
      backgroundColor: "transparent",
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
    },
    ghostPressed: {
      height: 52,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing["2xl"],
      opacity: 0.5,
    },
    icon: {
      width: 48,
      height: 48,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.xs,
      alignItems: "center",
      justifyContent: "center",
    },
    iconPressed: {
      width: 48,
      height: 48,
      backgroundColor: colorScheme.muted,
      borderRadius: borderRadius.xs,
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.7,
    },
    fab: {
      width: 56,
      height: 56,
      backgroundColor: colorScheme.primary,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    fabPressed: {
      width: 56,
      height: 56,
      backgroundColor: colorScheme.primary,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
      opacity: 0.7,
    },
  });

const createBadgeStyles = (colorScheme: typeof colors.light) =>
  StyleSheet.create({
    success: {
      backgroundColor: colorScheme.successBackground,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    danger: {
      backgroundColor: "rgba(239, 68, 68, 0.2)",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
    neutral: {
      backgroundColor: colorScheme.muted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: borderRadius.full,
    },
  });

const createTheme = (colorScheme: typeof colors.light) => ({
  colors: colorScheme,
  spacing,
  borderRadius,
  typography,
  components: {
    ...createComponentStyles(colorScheme),
    button: createButtonStyles(colorScheme),
    badge: createBadgeStyles(colorScheme),
  },
});

export const lightTheme = createTheme(colors.light);

export type Theme = typeof lightTheme;
export type ThemeColors = typeof colors.light;
