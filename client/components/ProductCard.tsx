import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ProfitBadge } from "@/components/ProfitBadge";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ProductCard({ product, onPress, compact = false }: ProductCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  if (compact) {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.compactCard, { backgroundColor: theme.backgroundDefault }, animatedStyle]}
        testID={`product-card-${product.id}`}
      >
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.compactImage}
          contentFit="cover"
        />
        <View style={styles.compactBadge}>
          <ProfitBadge profit={product.estimatedProfit} size="small" />
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { backgroundColor: theme.backgroundDefault }, animatedStyle]}
      testID={`product-card-${product.id}`}
    >
      <Image
        source={{ uri: product.imageUrl }}
        style={styles.image}
        contentFit="cover"
      />
      <View style={styles.content}>
        <ThemedText numberOfLines={2} style={styles.title}>
          {product.title}
        </ThemedText>
        <View style={styles.priceRow}>
          <ThemedText style={[styles.price, { color: theme.text }]}>
            ${product.currentPrice.toFixed(2)}
          </ThemedText>
          <ProfitBadge profit={product.estimatedProfit} />
        </View>
        <ThemedText style={[styles.soldText, { color: theme.textSecondary }]}>
          {product.soldCount} sold recently
        </ThemedText>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  image: {
    width: 100,
    height: 100,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: "space-between",
  },
  title: {
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 18,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
  price: {
    fontSize: 18,
    fontWeight: "700",
  },
  soldText: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  compactCard: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  compactImage: {
    width: "100%",
    height: "100%",
  },
  compactBadge: {
    position: "absolute",
    bottom: Spacing.sm,
    left: Spacing.sm,
  },
});
