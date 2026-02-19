import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  FlatList,
  ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useDesignTokens } from "@/hooks/useDesignTokens";

const { width } = Dimensions.get("window");

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";

interface OnboardingSlide {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  iconColor: string;
  tipIcon?: keyof typeof Feather.glyphMap;
  tip?: string;
}

const slides: OnboardingSlide[] = [
  {
    id: "welcome",
    icon: "tag",
    title: "Welcome to\nPocket Pricer",
    description: "Your personal product scanner that helps you find the best prices and maximize your reselling profit.",
    iconColor: "#10B981",
  },
  {
    id: "scan",
    icon: "camera",
    title: "Scan Any Product",
    description: "Point your camera at any item to instantly identify it. Works with clothing, electronics, toys, collectibles, and more.",
    iconColor: "#3B82F6",
    tipIcon: "zap",
    tip: "For best results, scan in good lighting with the product label or front visible.",
  },
  {
    id: "prices",
    icon: "bar-chart-2",
    title: "Compare Prices",
    description: "See real-time prices from Amazon, Walmart, Target, eBay, and other major platforms in one place.",
    iconColor: "#8B5CF6",
    tipIcon: "search",
    tip: "Tap 'Find More Listings' to search across even more platforms.",
  },
  {
    id: "profit",
    icon: "dollar-sign",
    title: "Calculate Profit",
    description: "Enter what you paid and see your estimated profit after ~13% selling fees. Know before you buy if it's worth flipping.",
    iconColor: "#F59E0B",
    tipIcon: "trending-up",
    tip: "Check the Market Demand indicator to see how fast items sell.",
  },
  {
    id: "pro",
    icon: "award",
    title: "Ready to Start",
    description: "You get 5 free scans to try it out. Upgrade to Pro for unlimited scans at $8.99/month, cancel anytime.",
    iconColor: "#10B981",
    tipIcon: "shield",
    tip: "No account needed. Subscriptions are managed through your App Store account.",
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => (
    <View style={[styles.slide, { width }]}>
      <Animated.View
        entering={FadeInUp.delay(150).duration(500)}
        style={[styles.iconContainer, { backgroundColor: item.iconColor + "15" }]}
      >
        <View style={[styles.iconInner, { backgroundColor: item.iconColor + "25" }]}>
          <Feather name={item.icon} size={48} color={item.iconColor} />
        </View>
      </Animated.View>
      <Animated.Text
        entering={FadeInUp.delay(300).duration(500)}
        style={[styles.title, { color: theme.colors.foreground }]}
      >
        {item.title}
      </Animated.Text>
      <Animated.Text
        entering={FadeInUp.delay(450).duration(500)}
        style={[styles.description, { color: theme.colors.mutedForeground }]}
      >
        {item.description}
      </Animated.Text>
      {item.tip ? (
        <Animated.View
          entering={FadeInDown.delay(600).duration(500)}
          style={[styles.tipCard, { backgroundColor: item.iconColor + "10", borderColor: item.iconColor + "30" }]}
        >
          <Feather name={item.tipIcon || "info"} size={16} color={item.iconColor} />
          <Text style={[styles.tipText, { color: theme.colors.foreground }]}>
            {item.tip}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );

  const isLastSlide = currentIndex === slides.length - 1;
  const isFirstSlide = currentIndex === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {isFirstSlide ? (
          <View style={styles.stepIndicator}>
            <Text style={[styles.stepText, { color: theme.colors.mutedForeground }]}>
              Quick Tour
            </Text>
          </View>
        ) : (
          <View style={styles.stepIndicator}>
            <Text style={[styles.stepText, { color: theme.colors.mutedForeground }]}>
              {currentIndex} of {slides.length - 1}
            </Text>
          </View>
        )}
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: theme.colors.mutedForeground }]}>
            Skip
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentIndex
                      ? theme.colors.primary
                      : theme.colors.muted,
                  width: index === currentIndex ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.nextButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? "Start Scanning" : isFirstSlide ? "Take the Tour" : "Next"}
          </Text>
          <Feather
            name={isLastSlide ? "arrow-right" : isFirstSlide ? "play" : "arrow-right"}
            size={20}
            color="#fff"
          />
        </Pressable>
      </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  stepIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepText: {
    fontSize: 14,
    fontWeight: "500",
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    fontSize: 16,
    fontWeight: "500",
  },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 36,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  footer: {
    paddingHorizontal: 24,
    gap: 24,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
