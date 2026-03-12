import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useDesignTokens } from "@/hooks/useDesignTokens";

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";

const FEATURES = [
  { icon: "camera" as const, label: "Scan any product", color: "#3B82F6" },
  { icon: "bar-chart-2" as const, label: "Compare prices across stores", color: "#8B5CF6" },
  { icon: "dollar-sign" as const, label: "See your profit instantly", color: "#F59E0B" },
];

function PulsingRing({ color, delay: ringDelay }: { color: string; delay: number }) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.6, { duration: 2000, easing: Easing.out(Easing.ease) }),
          withTiming(0.8, { duration: 0 })
        ),
        -1,
        false
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 200 }),
          withTiming(0, { duration: 1800, easing: Easing.out(Easing.ease) })
        ),
        -1,
        false
      );
    }, ringDelay);
    return () => clearTimeout(timeout);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 140,
          height: 140,
          borderRadius: 70,
          borderWidth: 2,
          borderColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

function FloatingIcon() {
  const translateY = useSharedValue(0);
  const iconScale = useSharedValue(0);

  useEffect(() => {
    iconScale.value = withSpring(1, { damping: 12, stiffness: 100 });
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: iconScale.value }],
  }));

  return (
    <Animated.View style={[styles.heroIcon, animatedStyle]}>
      <View style={styles.heroIconInner}>
        <Feather name="tag" size={52} color="#10B981" />
      </View>
    </Animated.View>
  );
}

interface OnboardingScreenProps {
  onComplete: () => void;
  isReplay?: boolean;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.content, { paddingTop: insets.top + 40 }]}>
        <View style={styles.heroSection}>
          <PulsingRing color="#10B981" delay={0} />
          <PulsingRing color="#10B981" delay={1000} />
          <FloatingIcon />
        </View>

        <Animated.Text
          entering={FadeInUp.delay(300).duration(600)}
          style={[styles.title, { color: theme.colors.foreground }]}
        >
          Pocket Pricer
        </Animated.Text>

        <Animated.Text
          entering={FadeInUp.delay(450).duration(600)}
          style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
        >
          Scan. Compare. Profit.
        </Animated.Text>

        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => (
            <Animated.View
              key={feature.label}
              entering={FadeInUp.delay(600 + index * 120).duration(500)}
              style={[styles.featureRow, { backgroundColor: feature.color + "10" }]}
            >
              <View style={[styles.featureIcon, { backgroundColor: feature.color + "20" }]}>
                <Feather name={feature.icon} size={20} color={feature.color} />
              </View>
              <Text style={[styles.featureLabel, { color: theme.colors.foreground }]}>
                {feature.label}
              </Text>
            </Animated.View>
          ))}
        </View>

        <Animated.View
          entering={FadeInUp.delay(1000).duration(500)}
          style={[styles.freeTag, { backgroundColor: theme.colors.primary + "15" }]}
        >
          <Feather name="gift" size={14} color={theme.colors.primary} />
          <Text style={[styles.freeTagText, { color: theme.colors.primary }]}>
            Try free for 3 days
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeInDown.delay(1100).duration(500)}
        style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}
      >
        <Pressable
          onPress={handleComplete}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Feather name="camera" size={20} color="#fff" />
          <Text style={styles.ctaText}>Scan</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export async function checkOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_COMPLETE_KEY);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  heroSection: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  heroIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#10B98118",
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#10B98128",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 40,
  },
  featuresContainer: {
    width: "100%",
    gap: 12,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  featureLabel: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  freeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  freeTagText: {
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    paddingHorizontal: 28,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
