import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import type { Product } from "@/types/product";

interface ProfitBreakdownProps {
  product: Product;
  userCost: number;
}

export function ProfitBreakdown({ product, userCost }: ProfitBreakdownProps) {
  const { theme } = useTheme();
  
  const sellingPrice = product.currentPrice;
  const ebayFees = product.ebayFees;
  const shipping = product.avgShipping;
  const netProfit = sellingPrice - userCost - ebayFees - shipping;
  const profitMargin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;
  
  const isProfit = netProfit > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <ThemedText style={styles.sectionTitle}>Profit Breakdown</ThemedText>
      
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Selling Price</ThemedText>
        <ThemedText style={styles.value}>${sellingPrice.toFixed(2)}</ThemedText>
      </View>
      
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Your Cost</ThemedText>
        <ThemedText style={[styles.value, { color: theme.danger }]}>-${userCost.toFixed(2)}</ThemedText>
      </View>
      
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>eBay Fees (~13%)</ThemedText>
        <ThemedText style={[styles.value, { color: theme.danger }]}>-${ebayFees.toFixed(2)}</ThemedText>
      </View>
      
      <View style={styles.row}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>Est. Shipping</ThemedText>
        <ThemedText style={[styles.value, { color: theme.danger }]}>-${shipping.toFixed(2)}</ThemedText>
      </View>
      
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      
      <View style={styles.row}>
        <ThemedText style={styles.profitLabel}>Net Profit</ThemedText>
        <ThemedText style={[styles.profitValue, { color: isProfit ? theme.success : theme.danger }]}>
          {isProfit ? "+" : ""}{netProfit >= 0 ? "$" : "-$"}{Math.abs(netProfit).toFixed(2)}
        </ThemedText>
      </View>
      
      <View style={[styles.marginContainer, { backgroundColor: isProfit ? theme.successBackground : "rgba(239, 68, 68, 0.2)" }]}>
        <ThemedText style={[styles.marginText, { color: isProfit ? theme.success : theme.danger }]}>
          {profitMargin.toFixed(1)}% margin
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  profitLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  profitValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  marginContainer: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  marginText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
