import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInUp,
  FadeInDown,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

const ONBOARDING_COMPLETE_KEY = "@pocket_pricer_onboarding_complete";

type OnboardingStep = "problem" | "solution" | "trial";
const STEPS: OnboardingStep[] = ["problem", "solution", "trial"];

interface OnboardingScreenProps {
  onComplete: () => void;
  onStartTrial?: () => void;
  isReplay?: boolean;
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={progressStyles.bar}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.segment,
            { backgroundColor: i <= current ? "#047857" : "rgba(255,255,255,0.2)" },
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

function ProblemStep() {
  return (
    <View style={pageStyles.container}>
      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={pageStyles.iconWrap}>
        <View style={pageStyles.iconSquare}>
          <View style={pageStyles.alertCircle}>
            <Feather name="alert-circle" size={28} color="#F97316" />
          </View>
        </View>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(450).duration(500)} style={pageStyles.label}>
        THE PROBLEM
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(650).duration(600)}>
        <Text style={pageStyles.title}>
          Listing prices{"\n"}are <Text style={pageStyles.titleCoral}>misleading</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(900).duration(600)} style={pageStyles.subtitle}>
        Most prices you see are what sellers ask — not what buyers actually pay.
      </Animated.Text>
    </View>
  );
}

function SolutionStepContent() {
  return (
    <View style={pageStyles.container}>
      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={pageStyles.iconWrap}>
        <View style={pageStyles.iconSquare}>
          <Feather name="camera" size={30} color="#047857" />
        </View>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(450).duration(500)} style={pageStyles.label}>
        THE SOLUTION
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(650).duration(600)}>
        <Text style={pageStyles.title}>
          Scan any item.{"\n"}<Text style={pageStyles.titleGreen}>Know its value.</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(900).duration(600)} style={pageStyles.subtitle}>
        Point your camera and get real sold prices from actual eBay transactions.
      </Animated.Text>
    </View>
  );
}

function TrialStep() {
  return (
    <View style={trialStyles.container}>
      <Animated.View entering={FadeInUp.delay(200).duration(600)} style={trialStyles.iconWrap}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={trialStyles.iconCircle}
        >
          <Feather name="tag" size={30} color="#3D2E00" style={{ transform: [{ scaleX: -1 }] }} />
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(450).duration(500)}>
        <LinearGradient
          colors={["#F5D87A", "#D4A926", "#E8C84A", "#D4A926"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={trialStyles.proBadge}
        >
          <Feather name="star" size={13} color="#3D2E00" />
          <Text style={trialStyles.proBadgeText}>POCKET PRICER PRO</Text>
        </LinearGradient>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(650).duration(600)}>
        <Text style={trialStyles.title}>
          You're ready.{"\n"}<Text style={trialStyles.titleGreen}>Let's flip smarter.</Text>
        </Text>
      </Animated.View>

      <Animated.Text entering={FadeInUp.delay(900).duration(600)} style={trialStyles.subtitle}>
        Try free for 3 days,{"\n"}no charge until day 4
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(1100).duration(500)} style={trialStyles.featureList}>
        <View style={trialStyles.featureRow}>
          <View style={trialStyles.checkCircle}>
            <Feather name="check" size={14} color="#047857" />
          </View>
          <Text style={trialStyles.featureText}>Unlimited scans</Text>
        </View>
        <View style={trialStyles.featureRow}>
          <View style={trialStyles.checkCircle}>
            <Feather name="check" size={14} color="#047857" />
          </View>
          <Text style={trialStyles.featureText}>Real sold prices</Text>
        </View>
        <View style={trialStyles.featureRow}>
          <View style={trialStyles.checkCircle}>
            <Feather name="check" size={14} color="#047857" />
          </View>
          <Text style={trialStyles.featureText}>Buy Score + Profit calc</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const trialStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 36,
    marginBottom: 10,
  },
  titleGreen: {
    color: "#10B981",
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 23,
    marginBottom: 28,
  },
  featureList: {
    alignSelf: "stretch",
    gap: 14,
    paddingHorizontal: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(4,120,87,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    fontSize: 17,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
});

const pageStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    marginBottom: 24,
  },
  iconSquare: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  alertCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(249,115,22,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 2,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 12,
    textAlign: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 40,
    marginBottom: 16,
  },
  titleCoral: {
    color: "#F87171",
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

export default function OnboardingScreen({ onComplete, onStartTrial }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const currentStep = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleComplete = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    onComplete();
  };

  const handleStartTrial = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    if (onStartTrial) {
      onStartTrial();
    } else {
      onComplete();
    }
  };

  const goNext = () => {
    if (transitioning) return;
    if (isLastStep) return;
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

  return (
    <LinearGradient
      colors={["#064E3B", "#065F46", "#047857", "#065F46"]}
      style={[styles.container, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.topBar}>
        {stepIndex > 0 ? (
          <Pressable onPress={goBack} hitSlop={12} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color="rgba(255,255,255,0.5)" />
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
        {currentStep === "problem" ? (
          <ProblemStep />
        ) : currentStep === "solution" ? (
          <SolutionStepContent />
        ) : (
          <TrialStep />
        )}
      </View>

      <Animated.View
        entering={FadeInDown.delay(500).duration(600)}
        style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
      >
        {isLastStep ? (
          <>
            <Pressable
              onPress={handleStartTrial}
              style={({ pressed }) => [
                styles.ctaButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <LinearGradient
                colors={["#F5D87A", "#D4A926", "#E8C84A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={[styles.ctaText, { color: "#3D2E00" }]}>Start Free Trial</Text>
                <Feather name="arrow-right" size={20} color="#3D2E00" />
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={handleComplete}
              style={({ pressed }) => [
                styles.ctaButton,
                { opacity: pressed ? 0.85 : 1, marginTop: 10 },
              ]}
            >
              <View style={styles.ctaOutline}>
                <Text style={styles.ctaText}>Start without Pro</Text>
              </View>
            </Pressable>
            <Text style={styles.legalNote}>No charge for 3 days · Cancel anytime</Text>
          </>
        ) : (
          <Pressable
            onPress={goNext}
            style={({ pressed }) => [
              styles.ctaButton,
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <View style={styles.ctaOutline}>
              <Text style={styles.ctaText}>Next</Text>
              <Feather name="arrow-right" size={20} color="#fff" />
            </View>
          </Pressable>
        )}
      </Animated.View>
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
    color: "rgba(255,255,255,0.4)",
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
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
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
  ctaText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  legalNote: {
    fontSize: 13,
    fontWeight: "500",
    color: "#047857",
    marginTop: 14,
  },
});
