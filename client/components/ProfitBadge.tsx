import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface ProfitBadgeProps {
  profit: number;
  size?: "small" | "medium" | "large";
}

export function ProfitBadge({ profit, size = "medium" }: ProfitBadgeProps) {
  const { theme } = useTheme();
  
  const isProfit = profit > 0;
  const isLoss = profit < 0;
  
  const backgroundColor = isProfit 
    ? theme.successBackground 
    : isLoss 
      ? "rgba(239, 68, 68, 0.2)" 
      : theme.backgroundSecondary;
  
  const textColor = isProfit 
    ? theme.success 
    : isLoss 
      ? theme.danger 
      : theme.textSecondary;

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, fontSize: 12 };
      case "large":
        return { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, fontSize: 18 };
      default:
        return { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, fontSize: 14 };
    }
  };

  const sizeStyles = getSizeStyles();

  return (
    <View style={[styles.badge, { backgroundColor, paddingHorizontal: sizeStyles.paddingHorizontal, paddingVertical: sizeStyles.paddingVertical }]}>
      <ThemedText style={[styles.text, { color: textColor, fontSize: sizeStyles.fontSize }]}>
        {isProfit ? "+" : ""}{profit >= 0 ? "$" : "-$"}{Math.abs(profit).toFixed(2)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  text: {
    fontWeight: "700",
  },
});
