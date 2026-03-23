import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";

type OnboardingStep = "categories" | "challenges" | "solution" | "ready";
const STEPS: OnboardingStep[] = ["categories", "challenges", "solution", "ready"];

interface OnboardingScreenProps {
  onComplete: () => void;
  isReplay?: boolean;
}

const CATEGORIES = [
  { id: "sneakers", label: "Sneakers", icon: "sunrise" as const, color: "#3B82F6", bg: "#EFF6FF" },
  { id: "electronics", label: "Electronics", icon: "smartphone" as const, color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "clothing", label: "Clothing", icon: "shopping-bag" as const, color: "#EC4899", bg: "#FDF2F8" },
  { id: "toys", label: "Toys & Games", icon: "box" as const, color: "#F59E0B", bg: "#FFFBEB" },
  { id: "books", label: "Books & Media", icon: "book-open" as const, color: "#10B981", bg: "#ECFDF5" },
  { id: "home", label: "Home & Kitchen", icon: "home" as const, color: "#EF4444", bg: "#FEF2F2" },
  { id: "sports", label: "Sports & Outdoors", icon: "activity" as const, color: "#06B6D4", bg: "#ECFEFF" },
  { id: "vintage", label: "Vintage & Collectibles", icon: "award" as const, color: "#D97706", bg: "#FFF7ED" },
];

const CHALLENGES = [
  { id: "pricing", label: "Not sure what things are worth", icon: "help-circle" as const, color: "#EF4444", bg: "#FEF2F2" },
  { id: "research", label: "Too much time researching", icon: "clock" as const, color: "#F59E0B", bg: "#FFFBEB" },
  { id: "bad-buys", label: "Bought items that didn't sell", icon: "thumbs-down" as const, color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "fees", label: "Surprised by platform fees", icon: "alert-circle" as const, color: "#EC4899", bg: "#FDF2F8" },
  { id: "slow", label: "Miss deals by being too slow", icon: "zap-off" as const, color: "#3B82F6", bg: "#EFF6FF" },
  { id: "competition", label: "Hard to compete with other sellers", icon: "users" as const, color: "#06B6D4", bg: "#ECFEFF" },
];

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={progressStyles.bar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.segment,
            { backgroundColor: i <= current ? "#047857" : "#E5E7EB" },
          ]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 4,
    height: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
  },
});

function GridTile({
  label,
  icon,
  color,
  bg,
  selected,
  onPress,
  delay,
}: {
  label: string;
  icon: any;
  color: string;
  bg: string;
  selected: boolean;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(350)} style={tileStyles.wrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          tileStyles.tile,
          { backgroundColor: selected ? color + "12" : bg, borderColor: selected ? color : "#E5E7EB", opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={[tileStyles.iconCircle, { backgroundColor: selected ? color + "20" : color + "12" }]}>
          <Feather name={icon} size={24} color={color} />
        </View>
        <Text style={[tileStyles.label, { color: selected ? color : "#374151" }]} numberOfLines={2}>
          {label}
        </Text>
        {selected ? (
          <View style={[tileStyles.check, { backgroundColor: color }]}>
            <Feather name="check" size={12} color="#fff" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const tileStyles = StyleSheet.create({
  wrapper: {
    width: "48%" as any,
    marginBottom: 10,
  },
  tile: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 2,
    position: "relative",
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});

function CategoriesStep({
  selections,
  onToggle,
}: {
  selections: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={stepStyles.container}>
      <Animated.Text entering={FadeInUp.delay(50).duration(400)} style={stepStyles.stepLabel}>
        STEP 1 OF 4
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={stepStyles.title}>
        What do you resell?
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={stepStyles.subtitle}>
        Pick the categories you buy and flip
      </Animated.Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={stepStyles.gridScroll}
      >
        <View style={stepStyles.grid}>
          {CATEGORIES.map((cat, i) => (
            <GridTile
              key={cat.id}
              label={cat.label}
              icon={cat.icon}
              color={cat.color}
              bg={cat.bg}
              selected={selections.has(cat.id)}
              onPress={() => onToggle(cat.id)}
              delay={200 + i * 60}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function ChallengesStep({
  selections,
  onToggle,
}: {
  selections: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={stepStyles.container}>
      <Animated.Text entering={FadeInUp.delay(50).duration(400)} style={stepStyles.stepLabel}>
        STEP 2 OF 4
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={stepStyles.title}>
        Sound familiar?
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={stepStyles.subtitle}>
        Select your biggest reselling headaches
      </Animated.Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={stepStyles.challengeScroll}
      >
        {CHALLENGES.map((ch, i) => (
          <Animated.View key={ch.id} entering={FadeInUp.delay(200 + i * 80).duration(400)}>
            <Pressable
              onPress={() => onToggle(ch.id)}
              style={({ pressed }) => [
                challengeStyles.row,
                {
                  backgroundColor: selections.has(ch.id) ? ch.color + "10" : "#F9FAFB",
                  borderColor: selections.has(ch.id) ? ch.color : "#E5E7EB",
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={[challengeStyles.iconBox, { backgroundColor: ch.bg }]}>
                <Feather name={ch.icon} size={22} color={ch.color} />
              </View>
              <Text
                style={[
                  challengeStyles.text,
                  { color: selections.has(ch.id) ? ch.color : "#374151" },
                ]}
              >
                {ch.label}
              </Text>
              {selections.has(ch.id) ? (
                <View style={[challengeStyles.check, { backgroundColor: ch.color }]}>
                  <Feather name="check" size={13} color="#fff" />
                </View>
              ) : (
                <View style={challengeStyles.emptyCheck} />
              )}
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const challengeStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 10,
    gap: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
});

function SolutionStep() {
  const features = [
    { icon: "camera" as const, title: "Scan any item", desc: "Point, scan, get results in seconds", gradient: ["#3B82F6", "#2563EB"] as [string, string] },
    { icon: "trending-up" as const, title: "Real sold prices", desc: "What buyers actually paid, not listing prices", gradient: ["#047857", "#065F46"] as [string, string] },
    { icon: "zap" as const, title: "Buy Score 0-100", desc: "Instantly know if it's worth buying", gradient: ["#F59E0B", "#D97706"] as [string, string] },
    { icon: "dollar-sign" as const, title: "Profit calculator", desc: "See your profit after all fees", gradient: ["#EF4444", "#DC2626"] as [string, string] },
  ];

  return (
    <View style={stepStyles.container}>
      <Animated.Text entering={FadeInUp.delay(50).duration(400)} style={stepStyles.stepLabel}>
        STEP 3 OF 4
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={stepStyles.title}>
        We solve all of that
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(150).duration(400)} style={stepStyles.subtitle}>
        Everything you need in one scan
      </Animated.Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={stepStyles.solutionScroll}
      >
        {features.map((f, i) => (
          <Animated.View key={f.title} entering={FadeInUp.delay(250 + i * 100).duration(400)}>
            <View style={solutionStyles.card}>
              <LinearGradient
                colors={f.gradient}
                style={solutionStyles.iconGradient}
              >
                <Feather name={f.icon} size={22} color="#fff" />
              </LinearGradient>
              <View style={solutionStyles.textWrap}>
                <Text style={solutionStyles.cardTitle}>{f.title}</Text>
                <Text style={solutionStyles.cardDesc}>{f.desc}</Text>
              </View>
              <Feather name="check-circle" size={20} color="#10B981" />
            </View>
          </Animated.View>
        ))}
        <Animated.View entering={FadeInUp.delay(700).duration(400)} style={solutionStyles.socialProof}>
          <View style={solutionStyles.starsRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Feather key={i} name="star" size={16} color="#F59E0B" />
            ))}
          </View>
          <Text style={solutionStyles.socialText}>Trusted by thousands of resellers</Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const solutionStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 12,
  },
  iconGradient: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 17,
  },
  socialProof: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 16,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 6,
  },
  socialText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
});

function ReadyStep() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={readyStyles.container}>
      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={pulseStyle}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={readyStyles.iconBg}
        >
          <Feather name="tag" size={44} color="#3D2E00" style={{ transform: [{ scaleX: -1 }] }} />
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(250).duration(400)}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={readyStyles.proBadge}
        >
          <Text style={readyStyles.proBadgeText}>POCKET PRICER PRO</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(350).duration(500)} style={readyStyles.title}>
        Try Pro free for 3 days
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={readyStyles.subtitle}>
        We want you to experience everything Pocket Pricer has to offer — unlimited scans, real sold prices, and profit tools — completely free.
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(650).duration(400)} style={readyStyles.statsRow}>
        <View style={readyStyles.stat}>
          <Text style={readyStyles.statNumber}>3s</Text>
          <Text style={readyStyles.statLabel}>Avg scan time</Text>
        </View>
        <View style={readyStyles.statDivider} />
        <View style={readyStyles.stat}>
          <Text style={readyStyles.statNumber}>4+</Text>
          <Text style={readyStyles.statLabel}>Stores compared</Text>
        </View>
        <View style={readyStyles.statDivider} />
        <View style={readyStyles.stat}>
          <Text style={readyStyles.statNumber}>Free</Text>
          <Text style={readyStyles.statLabel}>3-day trial</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(800).duration(400)} style={readyStyles.trialBadge}>
        <Feather name="shield" size={16} color="#D4A926" />
        <Text style={readyStyles.trialText}>Cancel anytime. No commitment.</Text>
      </Animated.View>
    </View>
  );
}

const readyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  iconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 16,
  },
  proBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#3D2E00",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    width: "100%",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#047857",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#D1FAE5",
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
  },
  trialText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#047857",
  },
});

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [categorySelections, setCategorySelections] = useState<Set<string>>(new Set());
  const [challengeSelections, setChallengeSelections] = useState<Set<string>>(new Set());
  const [transitioning, setTransitioning] = useState(false);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  const toggleCategory = (id: string) => {
    setCategorySelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChallenge = (id: string) => {
    setChallengeSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canContinue = () => {
    if (currentStep === "categories") return categorySelections.size > 0;
    if (currentStep === "challenges") return challengeSelections.size > 0;
    return true;
  };

  const goNext = () => {
    if (transitioning) return;
    if (isLastStep) {
      handleComplete();
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setStepIndex((prev) => prev + 1);
      setTransitioning(false);
    }, 50);
  };

  const goBack = () => {
    if (transitioning || stepIndex === 0) return;
    setTransitioning(true);
    setTimeout(() => {
      setStepIndex((prev) => prev - 1);
      setTransitioning(false);
    }, 50);
  };

  const ctaLabel = isLastStep ? "Start Free Trial" : "Continue";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        {stepIndex > 0 ? (
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="#6B7280" />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressWrap}>
          <ProgressBar current={stepIndex} total={STEPS.length} />
        </View>
        <Pressable onPress={handleComplete} hitSlop={12} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.content} key={currentStep}>
        {currentStep === "categories" ? (
          <CategoriesStep selections={categorySelections} onToggle={toggleCategory} />
        ) : currentStep === "challenges" ? (
          <ChallengesStep selections={challengeSelections} onToggle={toggleChallenge} />
        ) : currentStep === "solution" ? (
          <SolutionStep />
        ) : (
          <ReadyStep />
        )}
      </View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(400)}
        style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}
      >
        <Pressable
          onPress={goNext}
          disabled={!canContinue()}
          style={({ pressed }) => [
            styles.ctaButton,
            canContinue() ? { opacity: pressed ? 0.85 : 1 } : { opacity: 0.35 },
          ]}
        >
          <LinearGradient
            colors={isLastStep ? ["#F5D87A", "#D4A926", "#E8C84A"] : ["#047857", "#065F46"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={[styles.ctaText, isLastStep ? { color: "#3D2E00" } : null]}>
              {isLastStep ? "Claim Your Free Trial" : ctaLabel}
            </Text>
            <Feather name="arrow-right" size={20} color={isLastStep ? "#3D2E00" : "#fff"} />
          </LinearGradient>
        </Pressable>

        {currentStep === "categories" || currentStep === "challenges" ? (
          <Text style={styles.selectionCount}>
            {currentStep === "categories"
              ? `${categorySelections.size} selected`
              : `${challengeSelections.size} selected`}
          </Text>
        ) : null}
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

const stepStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  gridScroll: {
    paddingBottom: 20,
  },
  challengeScroll: {
    paddingBottom: 20,
  },
  solutionScroll: {
    paddingBottom: 20,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  skipBtn: {
    width: 40,
    alignItems: "flex-end",
  },
  skipText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    alignItems: "center",
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  selectionCount: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 10,
  },
});
