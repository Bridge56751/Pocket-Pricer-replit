import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";

type OnboardingStep = "hero" | "question" | "howItWorks";
const STEPS: OnboardingStep[] = ["hero", "question", "howItWorks"];

interface OnboardingScreenProps {
  onComplete: () => void;
  onStartTrial?: () => void;
  isReplay?: boolean;
}

function ProgressBar({ current, total, light }: { current: number; total: number; light?: boolean }) {
  return (
    <View style={progressStyles.bar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.segment,
            {
              backgroundColor: i <= current
                ? "#047857"
                : light ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.2)",
            },
          ]}
        />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 6,
    height: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 2,
  },
});

function HeroStep() {
  return (
    <View style={heroStyles.container}>
      <Animated.View entering={FadeInUp.delay(150).duration(700).springify().damping(18)} style={heroStyles.iconWrap}>
        <View style={heroStyles.iconSquare}>
          <Feather name="tag" size={32} color="#10B981" style={{ transform: [{ scaleX: -1 }] }} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(400).duration(700).springify().damping(18)}>
        <Text style={heroStyles.title}>
          Stop guessing.{"\n"}<Text style={heroStyles.titleGreen}>Start knowing.</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(600).duration(700).springify().damping(20)} style={heroStyles.subtitle}>
        The smarter way to find profitable items — before you buy them.
      </Animated.Text>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    marginBottom: 32,
  },
  iconSquare: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 42,
    marginBottom: 16,
  },
  titleGreen: {
    color: "#10B981",
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "400",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 25,
    paddingHorizontal: 8,
  },
});

const CATEGORIES = [
  {
    id: "thrift",
    icon: "gift" as const,
    title: "Thrift & estate sales",
    subtitle: "Vintage, collectibles, everyday finds",
  },
  {
    id: "electronics",
    icon: "monitor" as const,
    title: "Electronics",
    subtitle: "Gadgets, phones, accessories",
  },
  {
    id: "clothing",
    icon: "tag" as const,
    title: "Clothing & sneakers",
    subtitle: "Streetwear, vintage fashion, shoes",
  },
  {
    id: "everything",
    icon: "globe" as const,
    title: "Everything I find",
    subtitle: "General reselling, mixed categories",
  },
];

interface QuestionStepProps {
  selectedCategories: string[];
  onToggle: (id: string) => void;
}

function QuestionStep({ selectedCategories, onToggle }: QuestionStepProps) {
  return (
    <View style={questionStyles.container}>
      <Animated.Text entering={FadeInUp.delay(150).duration(700).springify().damping(20)} style={questionStyles.label}>
        QUICK QUESTION
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(350).duration(700).springify().damping(18)}>
        <Text style={questionStyles.title}>
          What do you{"\n"}mainly resell?
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(500).duration(700).springify().damping(20)} style={questionStyles.subtitle}>
        We'll tailor your experience
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(650).duration(700).springify().damping(16)} style={questionStyles.cardList}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategories.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              onPress={() => onToggle(cat.id)}
              style={[
                questionStyles.card,
                isSelected ? questionStyles.cardSelected : null,
              ]}
            >
              <View style={questionStyles.cardIconWrap}>
                <Feather name={cat.icon} size={20} color="#047857" />
              </View>
              <View style={questionStyles.cardTextWrap}>
                <Text style={questionStyles.cardTitle}>{cat.title}</Text>
                <Text style={questionStyles.cardSubtitle}>{cat.subtitle}</Text>
              </View>
              <View style={[
                questionStyles.checkCircle,
                isSelected ? questionStyles.checkCircleSelected : null,
              ]}>
                {isSelected ? (
                  <Feather name="check" size={14} color="#FFFFFF" />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const questionStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#047857",
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 38,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#6B7280",
    marginBottom: 28,
  },
  cardList: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardSelected: {
    borderColor: "#047857",
    backgroundColor: "#F0FDF4",
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(4,120,87,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  checkCircleSelected: {
    borderColor: "#047857",
    backgroundColor: "#047857",
  },
});

const PRO_FEATURES = [
  {
    icon: "camera" as const,
    title: "Unlimited scans",
    description: "No daily cap — scan everything you find",
  },
  {
    icon: "trending-up" as const,
    title: "Real sold prices",
    description: "What buyers actually paid, not just listings",
  },
  {
    icon: "bar-chart-2" as const,
    title: "Buy Score + Profit calc",
    description: "Know instantly if it's worth buying",
  },
];

function ProTrialStep() {
  return (
    <ScrollView
      style={proStyles.scroll}
      contentContainerStyle={proStyles.container}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInUp.delay(150).duration(700).springify().damping(18)} style={proStyles.iconWrap}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={proStyles.iconCircle}
        >
          <Feather name="tag" size={30} color="#3D2E00" style={{ transform: [{ scaleX: -1 }] }} />
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(350).duration(700).springify().damping(18)}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={proStyles.proBadge}
        >
          <Feather name="star" size={13} color="#3D2E00" />
          <Text style={proStyles.proBadgeText}>POCKET PRICER PRO</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(550).duration(700).springify().damping(18)}>
        <Text style={proStyles.title}>
          You're ready.{"\n"}<Text style={proStyles.titleGreen}>Let's flip smarter.</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(700).duration(700).springify().damping(20)} style={proStyles.subtitle}>
        Unlock everything you need to find profitable items with confidence.
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(850).duration(700).springify().damping(16)} style={proStyles.featureList}>
        {PRO_FEATURES.map((feat) => (
          <View key={feat.title} style={proStyles.featureCard}>
            <View style={proStyles.featureIconWrap}>
              <Feather name={feat.icon} size={20} color="#047857" />
            </View>
            <View style={proStyles.featureTextWrap}>
              <Text style={proStyles.featureTitle}>{feat.title}</Text>
              <Text style={proStyles.featureDescription}>{feat.description}</Text>
            </View>
            <View style={proStyles.featureCheck}>
              <Feather name="check" size={14} color="#FFFFFF" />
            </View>
          </View>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(1000).duration(700).springify().damping(18)} style={proStyles.trialInfo}>
        <Feather name="lock" size={16} color="#10B981" />
        <View>
          <Text style={proStyles.trialTitle}>Try free for 3 days</Text>
          <Text style={proStyles.trialSubtitle}>No charge until day 4 · Cancel anytime</Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const proStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  iconWrap: {
    marginBottom: 14,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  proBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 14,
  },
  proBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
    color: "#3D2E00",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 36,
    marginBottom: 8,
  },
  titleGreen: {
    color: "#10B981",
  },
  subtitle: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  featureList: {
    alignSelf: "stretch",
    gap: 10,
    marginBottom: 16,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(4,120,87,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255,255,255,0.55)",
  },
  featureCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  trialInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    backgroundColor: "rgba(16,185,129,0.08)",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.15)",
  },
  trialTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#10B981",
    marginBottom: 2,
  },
  trialSubtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(255,255,255,0.45)",
  },
});

export default function OnboardingScreen({ onComplete, onStartTrial }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isQuestionStep = currentStep === "question";

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  const handleFinishOnboarding = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    if (onStartTrial) {
      onStartTrial();
    } else {
      onComplete();
    }
  };

  const goNext = () => {
    if (transitioning) return;
    if (isLastStep) {
      handleFinishOnboarding();
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

  const buttonLabel = currentStep === "hero"
    ? "Get Started"
    : "Continue";

  const isButtonDisabled = currentStep === "question" && selectedCategories.length === 0;

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const content = (
    <>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {stepIndex > 0 ? (
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={isQuestionStep ? "#6B7280" : "rgba(255,255,255,0.5)"} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressWrap}>
          <ProgressBar current={stepIndex} total={STEPS.length} light={isQuestionStep} />
        </View>
        <Pressable onPress={handleComplete} hitSlop={12} style={[
          styles.skipBtn,
          isQuestionStep ? styles.skipBtnLight : styles.skipBtnDark,
        ]}>
          <Text style={[styles.skipText, isQuestionStep ? styles.skipTextLight : null]}>Skip</Text>
          <Feather name="arrow-right" size={14} color={isQuestionStep ? "#6B7280" : "rgba(255,255,255,0.4)"} />
        </Pressable>
      </View>

      <View style={styles.content} key={currentStep}>
        {currentStep === "hero" ? (
          <HeroStep />
        ) : currentStep === "question" ? (
          <QuestionStep selectedCategories={selectedCategories} onToggle={toggleCategory} />
        ) : (
          <ProTrialStep />
        )}
      </View>

      <Animated.View
        entering={FadeInDown.delay(400).duration(700).springify().damping(18)}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
        {isLastStep ? (
          <>
            <Pressable
              onPress={handleFinishOnboarding}
              style={({ pressed }) => [
                styles.ctaButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <LinearGradient
                colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGold}
              >
                <Feather name="star" size={16} color="#3D2E00" />
                <Text style={styles.ctaGoldText}>Start Free Trial</Text>
                <Feather name="arrow-right" size={18} color="#3D2E00" />
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={handleComplete}
              hitSlop={12}
              style={({ pressed }) => [
                styles.skipTrialBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={styles.skipTrialText}>Start without Pro</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={goNext}
            disabled={isButtonDisabled}
            style={({ pressed }) => [
              styles.ctaButton,
              { opacity: isButtonDisabled ? 0.4 : pressed ? 0.85 : 1 },
            ]}
          >
            <View style={[
              styles.ctaOutline,
              isQuestionStep ? styles.ctaOutlineLight : null,
            ]}>
              <Text style={[styles.ctaText, isQuestionStep ? styles.ctaTextLight : null]}>
                {buttonLabel}
              </Text>
              <Feather
                name="arrow-right"
                size={20}
                color={isQuestionStep ? "#111827" : "#fff"}
              />
            </View>
          </Pressable>
        )}
      </Animated.View>
    </>
  );

  if (isQuestionStep) {
    return (
      <View style={[styles.container, styles.containerLight]}>
        {content}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#022C22", "#033A2B", "#064E3B", "#033A2B"]}
      style={styles.container}
    >
      {content}
    </LinearGradient>
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
  containerLight: {
    backgroundColor: "#F9FAFB",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  skipBtnDark: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  skipBtnLight: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  skipText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
  },
  skipTextLight: {
    color: "#6B7280",
  },
  content: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  ctaButton: {
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
  },
  ctaOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  ctaOutlineLight: {
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  ctaTextLight: {
    color: "#111827",
  },
  ctaGold: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
    borderRadius: 16,
  },
  ctaGoldText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#3D2E00",
  },
  skipTrialBtn: {
    marginTop: 14,
    paddingVertical: 8,
  },
  skipTrialText: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.35)",
  },
});
