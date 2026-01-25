import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { getApiUrl } from "@/lib/query-client";

interface LegalAgreementModalProps {
  visible: boolean;
  onAgree: () => void;
  onCancel: () => void;
}

export function LegalAgreementModal({
  visible,
  onAgree,
  onCancel,
}: LegalAgreementModalProps) {
  const { theme } = useDesignTokens();

  const handleOpenPrivacyPolicy = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const privacyUrl = new URL("/privacy", getApiUrl()).toString();
      await WebBrowser.openBrowserAsync(privacyUrl);
    } catch (error) {
      console.error("Failed to open privacy policy:", error);
    }
  };

  const handleOpenTermsOfService = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const termsUrl = new URL("/terms", getApiUrl()).toString();
      await WebBrowser.openBrowserAsync(termsUrl);
    } catch (error) {
      console.error("Failed to open terms of service:", error);
    }
  };

  const handleAgree = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAgree();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.card },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.foreground }]}>
              Terms & Privacy
            </Text>
            <Text
              style={[styles.subtitle, { color: theme.colors.mutedForeground }]}
            >
              Please review and agree to continue
            </Text>
          </View>

          <View style={styles.content}>
            <Text
              style={[styles.description, { color: theme.colors.foreground }]}
            >
              By using Pocket Pricer, you agree to our:
            </Text>

            <Pressable
              onPress={handleOpenTermsOfService}
              style={({ pressed }) => [
                styles.linkRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View
                style={[
                  styles.linkIcon,
                  { backgroundColor: theme.colors.primary + "20" },
                ]}
              >
                <Text style={styles.linkIconText}>📜</Text>
              </View>
              <View style={styles.linkTextContainer}>
                <Text
                  style={[styles.linkTitle, { color: theme.colors.foreground }]}
                >
                  Terms of Service
                </Text>
                <Text
                  style={[
                    styles.linkDescription,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  Usage rules and subscription terms
                </Text>
              </View>
              <Text style={[styles.chevron, { color: theme.colors.primary }]}>
                ›
              </Text>
            </Pressable>

            <Pressable
              onPress={handleOpenPrivacyPolicy}
              style={({ pressed }) => [
                styles.linkRow,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View
                style={[
                  styles.linkIcon,
                  { backgroundColor: theme.colors.primary + "20" },
                ]}
              >
                <Text style={styles.linkIconText}>🔒</Text>
              </View>
              <View style={styles.linkTextContainer}>
                <Text
                  style={[styles.linkTitle, { color: theme.colors.foreground }]}
                >
                  Privacy Policy
                </Text>
                <Text
                  style={[
                    styles.linkDescription,
                    { color: theme.colors.mutedForeground },
                  ]}
                >
                  How we collect and use your data
                </Text>
              </View>
              <Text style={[styles.chevron, { color: theme.colors.primary }]}>
                ›
              </Text>
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={handleAgree}
              style={({ pressed }) => [
                styles.agreeButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={styles.agreeButtonText}>Agree & Continue</Text>
            </Pressable>

            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.cancelButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  { color: theme.colors.mutedForeground },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  description: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  linkIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  linkIconText: {
    fontSize: 20,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: 13,
  },
  chevron: {
    fontSize: 24,
    fontWeight: "300",
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  agreeButton: {
    height: 50,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  agreeButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  cancelButton: {
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
