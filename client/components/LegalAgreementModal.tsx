import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { getApiUrl } from "@/lib/query-client";

interface LegalAgreementModalProps {
  visible: boolean;
  onAgree: () => void;
  onCancel: () => void;
}

type ViewingDocument = "privacy" | "terms" | null;

export function LegalAgreementModal({
  visible,
  onAgree,
  onCancel,
}: LegalAgreementModalProps) {
  const { theme } = useDesignTokens();
  const insets = useSafeAreaInsets();
  const [viewingDocument, setViewingDocument] = useState<ViewingDocument>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleOpenPrivacyPolicy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewingDocument("privacy");
    setIsLoading(true);
  };

  const handleOpenTermsOfService = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewingDocument("terms");
    setIsLoading(true);
  };

  const handleCloseDocument = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewingDocument(null);
  };

  const handleAgree = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAgree();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  const getDocumentUrl = (doc: "privacy" | "terms") => {
    try {
      return new URL(`/${doc}`, getApiUrl()).toString();
    } catch {
      return "";
    }
  };

  if (viewingDocument) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        statusBarTranslucent
      >
        <View style={[styles.documentContainer, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
          <View style={[styles.documentHeader, { borderBottomColor: theme.colors.border }]}>
            <Pressable
              onPress={handleCloseDocument}
              style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="arrow-left" size={24} color={theme.colors.primary} />
              <Text style={[styles.backButtonText, { color: theme.colors.primary }]}>Back</Text>
            </Pressable>
            <Text style={[styles.documentTitle, { color: theme.colors.foreground }]}>
              {viewingDocument === "privacy" ? "Privacy Policy" : "Terms of Service"}
            </Text>
            <View style={styles.headerSpacer} />
          </View>
          
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : null}
          
          {Platform.OS === "web" ? (
            <iframe
              src={getDocumentUrl(viewingDocument)}
              style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <WebView
              source={{ uri: getDocumentUrl(viewingDocument) }}
              style={[styles.webview, isLoading && styles.hidden]}
              onLoadEnd={() => setIsLoading(false)}
            />
          )}
        </View>
      </Modal>
    );
  }

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
  documentContainer: {
    flex: 1,
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  backButtonText: {
    fontSize: 17,
    marginLeft: 4,
  },
  documentTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  headerSpacer: {
    width: 70,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  webview: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
});
