import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface SkeletonLoaderProps {
  count?: number;
  type?: "card" | "list";
}

function SkeletonItem({ type }: { type: "card" | "list" }) {
  const { theme } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  if (type === "card") {
    return (
      <View style={[styles.cardContainer, { backgroundColor: theme.backgroundDefault }]}>
        <Animated.View style={[styles.cardImage, { backgroundColor: theme.backgroundSecondary }, animatedStyle]} />
        <View style={styles.cardContent}>
          <Animated.View style={[styles.cardTitle, { backgroundColor: theme.backgroundSecondary }, animatedStyle]} />
          <Animated.View style={[styles.cardSubtitle, { backgroundColor: theme.backgroundSecondary }, animatedStyle]} />
          <Animated.View style={[styles.cardBadge, { backgroundColor: theme.backgroundSecondary }, animatedStyle]} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.listItem, { backgroundColor: theme.backgroundDefault }, animatedStyle]} />
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
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  cardImage: {
    width: 100,
    height: 100,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: "space-between",
  },
  cardTitle: {
    height: 16,
    borderRadius: BorderRadius.xs,
    width: "80%",
  },
  cardSubtitle: {
    height: 12,
    borderRadius: BorderRadius.xs,
    width: "60%",
  },
  cardBadge: {
    height: 24,
    borderRadius: BorderRadius.full,
    width: 80,
  },
  listItem: {
    height: 80,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
});
