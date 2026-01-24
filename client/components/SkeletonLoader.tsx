import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useDesignTokens } from "@/hooks/useDesignTokens";

interface SkeletonLoaderProps {
  count?: number;
  type?: "card" | "list";
}

function SkeletonItem({ type }: { type: "card" | "list" }) {
  const { theme } = useDesignTokens();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  if (type === "card") {
    return (
      <View style={[styles.cardContainer, { backgroundColor: theme.colors.card }]}>
        <Animated.View style={[styles.cardImage, { backgroundColor: theme.colors.muted }, animatedStyle]} />
        <View style={styles.cardContent}>
          <Animated.View style={[styles.cardTitle, { backgroundColor: theme.colors.muted }, animatedStyle]} />
          <Animated.View style={[styles.cardSubtitle, { backgroundColor: theme.colors.muted }, animatedStyle]} />
          <Animated.View style={[styles.cardBadge, { backgroundColor: theme.colors.muted }, animatedStyle]} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.listItem, { backgroundColor: theme.colors.card }, animatedStyle]} />
  );
}

export function SkeletonLoader({ count = 3, type = "card" }: SkeletonLoaderProps) {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonItem key={index} type={type} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardImage: {
    width: 100,
    height: 100,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  cardTitle: {
    height: 16,
    borderRadius: 8,
    width: "80%",
  },
  cardSubtitle: {
    height: 12,
    borderRadius: 8,
    width: "60%",
  },
  cardBadge: {
    height: 24,
    borderRadius: 9999,
    width: 80,
  },
  listItem: {
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
});
