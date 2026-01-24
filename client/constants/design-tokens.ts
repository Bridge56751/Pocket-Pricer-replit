import { StyleSheet, Platform } from "react-native";

export const colors = {
  light: {
    primary: "#10B981",
    primaryForeground: "#FFFFFF",
    danger: "#EF4444",
    dangerForeground: "#FFFFFF",
    success: "#10B981",
    successBackground: "#064E3B",
    warning: "#FBBF24",
    background: "#1F2937",
    foreground: "#F9FAFB",
    card: "#374151",
    cardForeground: "#F9FAFB",
    muted: "#4B5563",
    mutedForeground: "#9CA3AF",
    border: "#4B5563",
    input: "#4B5563",
    ring: "#10B981",
  },
  dark: {
    primary: "#10B981",
    primaryForeground: "#FFFFFF",
    danger: "#EF4444",
    dangerForeground: "#FFFFFF",
    success: "#10B981",
    successBackground: "#064E3B",
    warning: "#FBBF24",
    background: "#1F2937",
    foreground: "#F9FAFB",
    card: "#374151",
    cardForeground: "#F9FAFB",
    muted: "#4B5563",
    mutedForeground: "#9CA3AF",
    border: "#4B5563",
    input: "#4B5563",
    ring: "#10B981",
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
export const darkTheme = createTheme(colors.dark);

export type Theme = typeof lightTheme;
export type ThemeColors = typeof colors.light;
