/**
 * ProCapReachedModal
 *
 * Surfaces a friendly explanation when a Pro user has hit a per-customer
 * monthly provider cap on the backend (server-side P0-8).
 *
 * Backend contract (mirrors server/routes.ts buildEbayRateLimitPayload):
 *
 *   {
 *     cap: number,                       // e.g. 1000
 *     provider: "searchapi" | "serpapi", // for display + support routing
 *     resetAt: string,                   // ISO timestamp of cap reset (UTC)
 *     isPro: true,
 *     contactEmail: string               // release valve email
 *   }
 *
 * The modal is intentionally non-blocking — the user dismisses, returns
 * to the previous screen, and can try again next month OR contact support
 * to bump their cap (an env-var change on the backend, no deploy needed
 * per docs/RUNBOOK_PROVIDER_BUDGET.md).
 */
import React, { useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import type { Theme } from "@/constants/design-tokens";

export type RateLimitInfo = {
  cap: number;
  provider: string;
  resetAt: string;
  isPro: boolean;
  contactEmail: string;
};

interface Props {
  visible: boolean;
  rateLimit: RateLimitInfo | null;
  onClose: () => void;
}

function daysUntil(resetAtIso: string): number {
  const reset = new Date(resetAtIso).getTime();
  if (!Number.isFinite(reset)) return 0;
  const ms = reset - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function friendlyResetDate(resetAtIso: string): string {
  const reset = new Date(resetAtIso);
  if (isNaN(reset.getTime())) return "soon";
  return reset.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year:
      reset.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function ProCapReachedModal({ visible, rateLimit, onClose }: Props) {
  const { theme } = useDesignTokens();

  const days = useMemo(
    () => (rateLimit ? daysUntil(rateLimit.resetAt) : 0),
    [rateLimit],
  );
  const dateLabel = useMemo(
    () => (rateLimit ? friendlyResetDate(rateLimit.resetAt) : ""),
    [rateLimit],
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  // Defensive defaults: backend should always send a complete rateLimit
  // object, but if any required field is missing (older server build,
  // schema drift) we fall back gracefully instead of crashing with
  // TypeError. Was a real bug during local testing — server's
  // getDisplayedCap("scrapingdog") returned undefined → modal crashed at
  // `cap.toLocaleString()`. Defaults must be defined BEFORE handleEmail
  // closes over them.
  const safeCap =
    rateLimit &&
    typeof rateLimit.cap === "number" &&
    Number.isFinite(rateLimit.cap)
      ? rateLimit.cap
      : 0;
  const safeContactEmail =
    (rateLimit?.contactEmail as string | undefined) || "pricerpocket@gmail.com";

  const handleEmail = () => {
    if (!safeContactEmail) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const subject = encodeURIComponent(
      "Pocket Pricer Pro — please raise my monthly limit",
    );
    const body = encodeURIComponent(
      `Hi,\n\nI'm a Pocket Pricer Pro subscriber and I've hit my monthly limit. ` +
        `Could you please raise it?\n\nProvider: ${rateLimit?.provider ?? "(unknown)"}\n` +
        `Current cap: ${safeCap || "(unknown)"} /month\n\nThanks!`,
    );
    const url = `mailto:${safeContactEmail}?subject=${subject}&body=${body}`;
    Linking.openURL(url).catch(() => {
      // If the user's mail app isn't configured, fail silently — they
      // still see the email address on screen.
    });
  };

  if (!rateLimit) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.iconCircle}>
            <Feather name="clock" size={28} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>
            You&apos;ve reached your monthly limit
          </Text>

          <Text style={styles.body}>
            {safeCap > 0
              ? `You've used all ${safeCap.toLocaleString()} of your monthly scans for this service. `
              : `You've reached your monthly scan limit for this service. `}
            Your limit resets in{" "}
            <Text style={styles.bodyEmphasis}>
              {days} {days === 1 ? "day" : "days"}
            </Text>{" "}
            on <Text style={styles.bodyEmphasis}>{dateLabel}</Text>.
          </Text>

          <Text style={styles.bodySubtle}>
            If you need a higher limit, get in touch and we&apos;ll bump it for
            you — usually within a day.
          </Text>

          <Pressable style={styles.primaryButton} onPress={handleEmail}>
            <Feather name="mail" size={18} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Contact support</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Got it</Text>
          </Pressable>

          <Text style={styles.contactEmail}>{safeContactEmail}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: theme.colors.background,
      borderRadius: 20,
      padding: 28,
      alignItems: "center",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.25,
          shadowRadius: 24,
        },
        android: { elevation: 12 },
      }),
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.successBackground,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: theme.colors.foreground,
      textAlign: "center",
      marginBottom: 12,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.foreground,
      textAlign: "center",
      marginBottom: 12,
      fontFamily: "Inter_400Regular",
    },
    bodyEmphasis: {
      fontFamily: "Inter_600SemiBold",
      color: theme.colors.primary,
    },
    bodySubtle: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.mutedForeground,
      textAlign: "center",
      marginBottom: 20,
      fontFamily: "Inter_400Regular",
    },
    primaryButton: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      marginBottom: 10,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
    },
    secondaryButton: {
      width: "100%",
      paddingVertical: 12,
      alignItems: "center",
    },
    secondaryButtonText: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    contactEmail: {
      fontSize: 12,
      color: theme.colors.mutedForeground,
      marginTop: 8,
      fontFamily: "Inter_400Regular",
    },
  });
}
