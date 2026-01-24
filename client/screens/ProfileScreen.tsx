import React, { useState, useEffect } from "react";
import { View, StyleSheet, Pressable, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { getUserSettings, saveUserSettings } from "@/lib/storage";
import type { UserSettings } from "@/types/product";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [settings, setSettings] = useState<UserSettings>({
    defaultCost: 0,
    defaultShippingCost: 5,
    targetProfitMargin: 30,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await getUserSettings();
    setSettings(data);
  };

  const handleSave = async () => {
    setIsSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await saveUserSettings(settings);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: keyof UserSettings, value: string) => {
    const numValue = parseFloat(value) || 0;
    setSettings(prev => ({ ...prev, [key]: numValue }));
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
        },
      ]}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.sectionHeader}>
          <Feather name="dollar-sign" size={20} color={theme.primary} />
          <ThemedText style={styles.sectionTitle}>Default Settings</ThemedText>
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
            Default Item Cost ($)
          </ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            value={settings.defaultCost.toString()}
            onChangeText={(value) => updateSetting("defaultCost", value)}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.textSecondary}
            testID="input-default-cost"
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
            Default Shipping Cost ($)
          </ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            value={settings.defaultShippingCost.toString()}
            onChangeText={(value) => updateSetting("defaultShippingCost", value)}
            keyboardType="decimal-pad"
            placeholder="5.00"
            placeholderTextColor={theme.textSecondary}
            testID="input-shipping-cost"
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
            Target Profit Margin (%)
          </ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            value={settings.targetProfitMargin.toString()}
            onChangeText={(value) => updateSetting("targetProfitMargin", value)}
            keyboardType="decimal-pad"
            placeholder="30"
            placeholderTextColor={theme.textSecondary}
            testID="input-target-margin"
          />
        </View>
      </View>

      <Button onPress={handleSave} disabled={isSaving} style={styles.saveButton}>
        {isSaving ? "Saving..." : "Save Settings"}
      </Button>

      <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.sectionHeader}>
          <Feather name="info" size={20} color={theme.primary} />
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
        </View>

        <Pressable style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText>Privacy Policy</ThemedText>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, { opacity: pressed ? 0.7 : 1 }]}>
          <ThemedText>Terms of Service</ThemedText>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Pressable>

        <View style={styles.versionContainer}>
          <ThemedText style={[styles.versionText, { color: theme.textSecondary }]}>
            Version 1.0.0
          </ThemedText>
        </View>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: Spacing.sm,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 14,
    marginBottom: Spacing.sm,
  },
  input: {
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
    }),
  },
  saveButton: {
    marginBottom: Spacing.lg,
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  versionContainer: {
    marginTop: Spacing.lg,
    alignItems: "center",
  },
  versionText: {
    fontSize: 12,
  },
});
