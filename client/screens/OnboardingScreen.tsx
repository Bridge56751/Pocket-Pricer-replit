import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
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
      <Animated.View entering={FadeInUp.delay(100).duration(450)} style={heroStyles.iconWrap}>
        <View style={heroStyles.iconSquare}>
          <Feather name="tag" size={32} color="#10B981" style={{ transform: [{ scaleX: -1 }] }} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(350).duration(450)}>
        <Text style={heroStyles.title}>
          Stop guessing.{"\n"}<Text style={heroStyles.titleGreen}>Start knowing.</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(550).duration(450)} style={heroStyles.subtitle}>
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
  selectedCategory: string | null;
  onSelect: (id: string) => void;
}

function QuestionStep({ selectedCategory, onSelect }: QuestionStepProps) {
  return (
    <View style={questionStyles.container}>
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={questionStyles.label}>
        QUICK QUESTION
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(250).duration(450)}>
        <Text style={questionStyles.title}>
          What do you{"\n"}mainly resell?
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(400).duration(400)} style={questionStyles.subtitle}>
        We'll tailor your experience
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(500).duration(450)} style={questionStyles.cardList}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => onSelect(cat.id)}
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

const HOW_IT_WORKS_STEPS = [
  {
    number: "1",
    title: "Point & scan",
    description: "Aim your camera at any product — barcode, label, or just the item itself",
  },
  {
    number: "2",
    title: "See real sold prices",
    description: "Instantly see what buyers actually paid on eBay — not just asking prices",
  },
  {
    number: "3",
    title: "Know your profit",
    description: "Get Buy Score, demand rating, and estimated profit after fees in seconds",
  },
];

function HowItWorksStep() {
  return (
    <ScrollView
      style={howStyles.scroll}
      contentContainerStyle={howStyles.container}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={howStyles.label}>
        HOW IT WORKS
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(250).duration(450)}>
        <Text style={howStyles.title}>
          Three seconds to{"\n"}<Text style={howStyles.titleGreen}>know the profit</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(400).duration(400)} style={howStyles.subtitle}>
        No guessing. No research. Just scan and go.
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(550).duration(450)} style={howStyles.stepList}>
        {HOW_IT_WORKS_STEPS.map((step) => (
          <View key={step.number} style={howStyles.stepCard}>
            <View style={howStyles.stepNumberCircle}>
              <Text style={howStyles.stepNumberText}>{step.number}</Text>
            </View>
            <View style={howStyles.stepTextWrap}>
              <Text style={howStyles.stepTitle}>{step.title}</Text>
              <Text style={howStyles.stepDescription}>{step.description}</Text>
            </View>
          </View>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

const howStyles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#10B981",
    marginBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 38,
    marginBottom: 10,
  },
  titleGreen: {
    color: "#10B981",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "rgba(255,255,255,0.5)",
    marginBottom: 28,
  },
  stepList: {
    gap: 14,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#047857",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  stepTextWrap: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    fontWeight: "400",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 20,
  },
});

export default function OnboardingScreen({ onComplete, onStartTrial }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
    : currentStep === "question"
    ? "Continue"
    : "Makes sense";

  const isButtonDisabled = currentStep === "question" && selectedCategory === null;

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
          <QuestionStep selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
        ) : (
          <HowItWorksStep />
        )}
      </View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(450)}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
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
});
