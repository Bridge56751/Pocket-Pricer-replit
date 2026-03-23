import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeIn,
  FadeOut,
  FadeInUp,
  FadeInDown,
  SlideInRight,
  SlideOutLeft,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type OnboardingStep =
  | "welcome"
  | "pain1"
  | "pain2"
  | "pain3"
  | "solution"
  | "features"
  | "ready";

const STEPS: OnboardingStep[] = [
  "welcome",
  "pain1",
  "pain2",
  "pain3",
  "solution",
  "features",
  "ready",
];

interface OnboardingScreenProps {
  onComplete: () => void;
  isReplay?: boolean;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={progressStyles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.dot,
            i <= current ? progressStyles.dotActive : progressStyles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginBottom: 16,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  dotActive: {
    width: 24,
    backgroundColor: "#047857",
  },
  dotInactive: {
    width: 12,
    backgroundColor: "#D1D5DB",
  },
});

function PainPointOption({
  text,
  selected,
  onPress,
  delay,
}: {
  text: string;
  selected: boolean;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          optionStyles.option,
          selected ? optionStyles.optionSelected : optionStyles.optionDefault,
          { opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text
          style={[
            optionStyles.optionText,
            selected ? optionStyles.optionTextSelected : optionStyles.optionTextDefault,
          ]}
        >
          {text}
        </Text>
        {selected ? (
          <View style={optionStyles.checkCircle}>
            <Feather name="check" size={14} color="#fff" />
          </View>
        ) : (
          <View style={optionStyles.emptyCircle} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const optionStyles = StyleSheet.create({
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 10,
  },
  optionDefault: {
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  optionSelected: {
    backgroundColor: "#ECFDF5",
    borderColor: "#047857",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  optionTextDefault: {
    color: "#374151",
  },
  optionTextSelected: {
    color: "#047857",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#D1D5DB",
  },
});

function BouncingIcon({ name, size, color }: { name: any; size: number; color: string }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 8, stiffness: 120 });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <View style={[iconStyles.circle, { backgroundColor: color + "15" }]}>
        <Feather name={name} size={size} color={color} />
      </View>
    </Animated.View>
  );
}

const iconStyles = StyleSheet.create({
  circle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
});

function WelcomeStep() {
  return (
    <View style={stepStyles.centered}>
      <Animated.View entering={FadeInUp.delay(100).duration(500)}>
        <View style={stepStyles.welcomeIconWrap}>
          <LinearGradient
            colors={["#ECFDF5", "#D1FAE5"]}
            style={stepStyles.welcomeIconBg}
          >
            <Feather name="tag" size={48} color="#047857" style={{ transform: [{ scaleX: -1 }] }} />
          </LinearGradient>
        </View>
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(300).duration(500)} style={stepStyles.bigTitle}>
        Welcome to{"\n"}Pocket Pricer
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={stepStyles.subtitle}>
        Let's find out how we can help you make more money reselling.
      </Animated.Text>
    </View>
  );
}

function PainStep1({ selections, onToggle }: { selections: Set<string>; onToggle: (s: string) => void }) {
  const options = [
    "I never know if an item is worth buying",
    "I spend too long researching prices",
    "I've bought items that didn't sell",
    "I miss good deals because I'm too slow",
  ];

  return (
    <View style={stepStyles.fullWidth}>
      <Animated.View entering={FadeInUp.delay(100).duration(400)}>
        <BouncingIcon name="help-circle" size={40} color="#3B82F6" />
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(200).duration(400)} style={stepStyles.question}>
        What's your biggest challenge when sourcing items to resell?
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(300).duration(400)} style={stepStyles.hint}>
        Select all that apply
      </Animated.Text>
      <View style={stepStyles.optionsWrap}>
        {options.map((opt, i) => (
          <PainPointOption
            key={opt}
            text={opt}
            selected={selections.has(opt)}
            onPress={() => onToggle(opt)}
            delay={400 + i * 100}
          />
        ))}
      </View>
    </View>
  );
}

function PainStep2({ selections, onToggle }: { selections: Set<string>; onToggle: (s: string) => void }) {
  const options = [
    "Thrift stores & garage sales",
    "Retail & clearance aisles",
    "Online arbitrage",
    "Wholesale & liquidation",
  ];

  return (
    <View style={stepStyles.fullWidth}>
      <Animated.View entering={FadeInUp.delay(100).duration(400)}>
        <BouncingIcon name="shopping-bag" size={40} color="#8B5CF6" />
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(200).duration(400)} style={stepStyles.question}>
        Where do you usually find items to resell?
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(300).duration(400)} style={stepStyles.hint}>
        Select all that apply
      </Animated.Text>
      <View style={stepStyles.optionsWrap}>
        {options.map((opt, i) => (
          <PainPointOption
            key={opt}
            text={opt}
            selected={selections.has(opt)}
            onPress={() => onToggle(opt)}
            delay={400 + i * 100}
          />
        ))}
      </View>
    </View>
  );
}

function PainStep3({ selected, onSelect }: { selected: string | null; onSelect: (s: string) => void }) {
  const options = [
    "Just getting started",
    "A few sales per month",
    "Consistent side income",
    "Full-time reseller",
  ];

  return (
    <View style={stepStyles.fullWidth}>
      <Animated.View entering={FadeInUp.delay(100).duration(400)}>
        <BouncingIcon name="trending-up" size={40} color="#F59E0B" />
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(200).duration(400)} style={stepStyles.question}>
        How would you describe your reselling experience?
      </Animated.Text>
      <View style={stepStyles.optionsWrap}>
        {options.map((opt, i) => (
          <PainPointOption
            key={opt}
            text={opt}
            selected={selected === opt}
            onPress={() => onSelect(opt)}
            delay={400 + i * 100}
          />
        ))}
      </View>
    </View>
  );
}

function SolutionStep() {
  return (
    <View style={stepStyles.centered}>
      <Animated.View entering={FadeInUp.delay(100).duration(500)}>
        <View style={stepStyles.solutionIconWrap}>
          <View style={stepStyles.solutionIconBg}>
            <Feather name="check-circle" size={52} color="#047857" />
          </View>
        </View>
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(300).duration(500)} style={stepStyles.bigTitle}>
        We've got you covered
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={stepStyles.subtitle}>
        Pocket Pricer gives you instant pricing data so you can make confident buy decisions in seconds — not hours.
      </Animated.Text>
    </View>
  );
}

function FeaturesStep() {
  const features = [
    {
      icon: "camera" as const,
      title: "Scan any product",
      desc: "Point your camera and identify items instantly",
      color: "#3B82F6",
    },
    {
      icon: "bar-chart-2" as const,
      title: "See real sold prices",
      desc: "Know what items actually sell for, not just listing prices",
      color: "#047857",
    },
    {
      icon: "zap" as const,
      title: "Buy Score rating",
      desc: "0-100 score tells you if it's worth buying",
      color: "#F59E0B",
    },
    {
      icon: "dollar-sign" as const,
      title: "Instant profit calc",
      desc: "See your profit after fees before you buy",
      color: "#EF4444",
    },
  ];

  return (
    <View style={stepStyles.fullWidth}>
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={stepStyles.question}>
        Here's how it works
      </Animated.Text>
      <View style={stepStyles.featuresList}>
        {features.map((f, i) => (
          <Animated.View
            key={f.title}
            entering={FadeInUp.delay(300 + i * 120).duration(400)}
            style={stepStyles.featureCard}
          >
            <View style={[stepStyles.featureIconCircle, { backgroundColor: f.color + "15" }]}>
              <Feather name={f.icon} size={22} color={f.color} />
            </View>
            <View style={stepStyles.featureTextWrap}>
              <Text style={stepStyles.featureTitle}>{f.title}</Text>
              <Text style={stepStyles.featureDesc}>{f.desc}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function ReadyStep() {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={stepStyles.centered}>
      <Animated.View entering={FadeInUp.delay(100).duration(500)} style={pulseStyle}>
        <LinearGradient
          colors={["#065F46", "#047857", "#059669"]}
          style={stepStyles.readyIconBg}
        >
          <Feather name="tag" size={44} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
        </LinearGradient>
      </Animated.View>
      <Animated.Text entering={FadeInUp.delay(300).duration(500)} style={stepStyles.bigTitle}>
        You're all set!
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(500).duration(500)} style={stepStyles.subtitle}>
        Start your free trial and never overpay for inventory again.
      </Animated.Text>
      <Animated.View entering={FadeInUp.delay(700).duration(400)} style={stepStyles.trialBadge}>
        <Feather name="gift" size={16} color="#047857" />
        <Text style={stepStyles.trialBadgeText}>3-day free trial included</Text>
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [pain1Selections, setPain1Selections] = useState<Set<string>>(new Set());
  const [pain2Selections, setPain2Selections] = useState<Set<string>>(new Set());
  const [pain3Selected, setPain3Selected] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  const togglePain1 = (opt: string) => {
    setPain1Selections((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const togglePain2 = (opt: string) => {
    setPain2Selections((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const canContinue = () => {
    if (currentStep === "pain1") return pain1Selections.size > 0;
    if (currentStep === "pain2") return pain2Selections.size > 0;
    if (currentStep === "pain3") return pain3Selected !== null;
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

  const ctaLabel = isLastStep ? "Get Started" : "Continue";

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
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
        {currentStep === "welcome" ? (
          <WelcomeStep />
        ) : currentStep === "pain1" ? (
          <PainStep1 selections={pain1Selections} onToggle={togglePain1} />
        ) : currentStep === "pain2" ? (
          <PainStep2 selections={pain2Selections} onToggle={togglePain2} />
        ) : currentStep === "pain3" ? (
          <PainStep3 selected={pain3Selected} onSelect={setPain3Selected} />
        ) : currentStep === "solution" ? (
          <SolutionStep />
        ) : currentStep === "features" ? (
          <FeaturesStep />
        ) : (
          <ReadyStep />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={goNext}
          disabled={!canContinue()}
          style={({ pressed }) => [
            styles.ctaButton,
            canContinue()
              ? { opacity: pressed ? 0.85 : 1 }
              : { opacity: 0.4 },
          ]}
        >
          <LinearGradient
            colors={["#059669", "#047857", "#065F46"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
            <Feather name={isLastStep ? "arrow-right" : "arrow-right"} size={20} color="#fff" />
          </LinearGradient>
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

const stepStyles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  fullWidth: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  welcomeIconWrap: {
    marginBottom: 32,
    alignItems: "center",
  },
  welcomeIconBg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
  },
  solutionIconWrap: {
    marginBottom: 32,
    alignItems: "center",
  },
  solutionIconBg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  readyIconBg: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  bigTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 38,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "400",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  question: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 6,
  },
  hint: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginBottom: 20,
  },
  optionsWrap: {
    marginTop: 4,
  },
  featuresList: {
    marginTop: 20,
    gap: 14,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#F9FAFB",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  featureIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 18,
  },
  trialBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
  },
  trialBadgeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#047857",
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
    marginBottom: 8,
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
    paddingHorizontal: 24,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
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
});
