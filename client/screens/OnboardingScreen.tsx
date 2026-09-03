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

function ProgressBar({
  current,
  total,
  light,
}: {
  current: number;
  total: number;
  light?: boolean;
}) {
  return (
    <View style={progressStyles.bar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.segment,
            {
              backgroundColor:
                i <= current
                  ? "#047857"
                  : light
                    ? "rgba(0,0,0,0.1)"
                    : "rgba(255,255,255,0.2)",
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
      <Animated.View
        entering={FadeInUp.delay(150)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={heroStyles.iconWrap}
      >
        <View style={heroStyles.iconSquare}>
          <Feather
            name="tag"
            size={32}
            color="#10B981"
            style={{ transform: [{ scaleX: -1 }] }}
          />
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(350)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
      >
        <Text style={heroStyles.title}>
          Stop guessing.{"\n"}
          <Text style={heroStyles.titleGreen}>Start knowing.</Text>
        </Text>
      </Animated.View>

      <Animated.Text
        entering={FadeInUp.delay(500)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={heroStyles.subtitle}
      >
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
      <Animated.Text
        entering={FadeInUp.delay(150)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={questionStyles.label}
      >
        QUICK QUESTION
      </Animated.Text>

      <Animated.View
        entering={FadeInUp.delay(300)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
      >
        <Text style={questionStyles.title}>
          What do you{"\n"}mainly resell?
        </Text>
      </Animated.View>

      <Animated.Text
        entering={FadeInUp.delay(450)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={questionStyles.subtitle}
      >
        Select all that apply
      </Animated.Text>

      <Animated.View
        entering={FadeInUp.delay(600)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={questionStyles.cardList}
      >
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategories.includes(cat.id);
          return (
            <Pressable
              key={cat.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`${cat.title}. ${cat.subtitle}`}
              accessibilityState={{ checked: isSelected }}
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
              <View
                style={[
                  questionStyles.checkCircle,
                  isSelected ? questionStyles.checkCircleSelected : null,
                ]}
              >
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
    title: "Expanded photo scanning",
    description: "Research more finds with Pocket Pricer Pro",
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
      <Animated.View
        entering={FadeInUp.delay(150)
          .duration(500)
          .easing(Easing.out(Easing.quad))}
        style={proStyles.hero}
      >
        <View style={proStyles.heroCopy}>
          <Text style={proStyles.kicker}>POCKET PRICER PRO</Text>
          <Text style={proStyles.title}>
            Your edge,{"\n"}
            <Text style={proStyles.titleGreen}>from day one.</Text>
          </Text>
          <Text style={proStyles.subtitle}>
            Make confident buys with better research, real sold-price comps, and
            clear profit math.
          </Text>
        </View>
        <View style={proStyles.tagArtwork}>
          <View style={proStyles.tagHole} />
          <Feather name="dollar-sign" size={38} color="#F7E6A6" />
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(350)
          .duration(500)
          .easing(Easing.out(Easing.quad))}
        style={proStyles.valueCard}
      >
        <View style={proStyles.valueHeader}>
          <View style={proStyles.valueIcon}>
            <Feather name="award" size={17} color="#F5D66E" />
          </View>
          <Text style={proStyles.valueTitle}>The pocket advantage</Text>
        </View>
        {PRO_FEATURES.map((feat) => (
          <View key={feat.title} style={proStyles.featureRow}>
            <View style={proStyles.featureCheck}>
              <Feather name="check" size={13} color="#06452F" />
            </View>
            <View style={proStyles.featureTextWrap}>
              <Text style={proStyles.featureTitle}>{feat.title}</Text>
              <Text style={proStyles.featureDescription}>
                {feat.description}
              </Text>
            </View>
          </View>
        ))}
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(550)
          .duration(500)
          .easing(Easing.out(Easing.quad))}
        style={proStyles.planNote}
      >
        <View style={proStyles.planNoteIcon}>
          <Feather name="shield" size={17} color="#B78016" />
        </View>
        <View style={proStyles.planNoteCopy}>
          <Text style={proStyles.planNoteTitle}>
            Choose what fits your hustle
          </Text>
          <Text style={proStyles.planNoteText}>
            Continue to see available plans and localized store pricing.
          </Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const proStyles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  hero: {
    minHeight: 205,
    borderRadius: 24,
    backgroundColor: "#EAF2E7",
    padding: 22,
    overflow: "hidden",
    justifyContent: "center",
  },
  heroCopy: { width: "70%", zIndex: 2 },
  kicker: {
    color: "#A06E10",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 9,
  },
  title: {
    fontSize: 31,
    fontWeight: "800",
    color: "#063E2C",
    lineHeight: 34,
    letterSpacing: -1,
  },
  titleGreen: { color: "#007451" },
  subtitle: {
    color: "#49685D",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  tagArtwork: {
    position: "absolute",
    right: 18,
    top: 51,
    width: 84,
    height: 111,
    borderRadius: 20,
    backgroundColor: "#008256",
    transform: [{ rotate: "24deg" }],
    alignItems: "center",
    justifyContent: "center",
  },
  tagHole: {
    position: "absolute",
    top: 11,
    left: 12,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#EAF2E7",
    borderWidth: 3,
    borderColor: "#07513A",
  },
  valueCard: {
    borderRadius: 22,
    backgroundColor: "#00583C",
    padding: 19,
    marginTop: 14,
  },
  valueHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  valueIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,.13)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  valueTitle: {
    color: "#FFF8E5",
    fontSize: 17,
    fontWeight: "800",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 11,
  },
  featureTextWrap: { flex: 1 },
  featureTitle: {
    color: "#F9F8EB",
    fontSize: 13,
    fontWeight: "700",
  },
  featureDescription: {
    color: "#B9D6C8",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F7E7A9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  planNote: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF9E9",
    borderRadius: 17,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E8D7A7",
    marginTop: 14,
  },
  planNoteIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F7E7A9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  planNoteCopy: { flex: 1 },
  planNoteTitle: { color: "#123B2D", fontSize: 14, fontWeight: "800" },
  planNoteText: {
    color: "#71877B",
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
});

export default function OnboardingScreen({
  onComplete,
  onStartTrial,
}: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;
  const isQuestionStep = currentStep === "question";
  const isLightStep = isQuestionStep || isLastStep;

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

  const buttonLabel = currentStep === "hero" ? "Get Started" : "Continue";

  const isButtonDisabled =
    currentStep === "question" && selectedCategories.length === 0;

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const content = (
    <>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        {stepIndex > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={goBack}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Feather
              name="arrow-left"
              size={22}
              color={isLightStep ? "#527065" : "rgba(255,255,255,0.5)"}
            />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressWrap}>
          <ProgressBar
            current={stepIndex}
            total={STEPS.length}
            light={isLightStep}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          onPress={handleComplete}
          hitSlop={12}
          style={[
            styles.skipBtn,
            isLightStep ? styles.skipBtnLight : styles.skipBtnDark,
          ]}
        >
          <Text
            style={[styles.skipText, isLightStep ? styles.skipTextLight : null]}
          >
            Skip
          </Text>
          <Feather
            name="arrow-right"
            size={14}
            color={isLightStep ? "#527065" : "rgba(255,255,255,0.4)"}
          />
        </Pressable>
      </View>

      <View style={styles.content} key={currentStep}>
        {currentStep === "hero" ? (
          <HeroStep />
        ) : currentStep === "question" ? (
          <QuestionStep
            selectedCategories={selectedCategories}
            onToggle={toggleCategory}
          />
        ) : (
          <ProTrialStep />
        )}
      </View>

      <Animated.View
        entering={FadeInDown.delay(400)
          .duration(600)
          .easing(Easing.out(Easing.quad))}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
        {isLastStep ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Pocket Pricer Pro plans"
              onPress={handleFinishOnboarding}
              style={({ pressed }) => [
                styles.ctaButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <LinearGradient
                colors={["#006E49", "#004C35"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaPro}
              >
                <Feather name="shield" size={17} color="#F8D96C" />
                <Text style={styles.ctaProText}>View Pro Plans</Text>
                <Feather name="arrow-right" size={18} color="#FFF9E8" />
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start without Pocket Pricer Pro"
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
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            accessibilityState={{ disabled: isButtonDisabled }}
            onPress={goNext}
            disabled={isButtonDisabled}
            style={({ pressed }) => [
              styles.ctaButton,
              { opacity: isButtonDisabled ? 0.4 : pressed ? 0.85 : 1 },
            ]}
          >
            <View
              style={[
                styles.ctaOutline,
                isQuestionStep ? styles.ctaOutlineLight : null,
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  isQuestionStep ? styles.ctaTextLight : null,
                ]}
              >
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

  if (isLightStep) {
    return (
      <View
        style={[
          styles.container,
          isLastStep ? styles.containerPro : styles.containerLight,
        ]}
      >
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
  containerPro: {
    backgroundColor: "#F7F5ED",
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
  ctaPro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
    borderRadius: 16,
  },
  ctaProText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFF9E8",
  },
  skipTrialBtn: {
    marginTop: 14,
    paddingVertical: 8,
  },
  skipTrialText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#527065",
  },
});
