import React, { useState } from "react";
import { View, StyleSheet, Pressable, Text, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ScrollView } from "react-native";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { clearSearchHistory, clearFavorites } from "@/lib/storage";

type ThemeOption = "light" | "dark" | "system";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme, themeMode, setThemeMode, isDarkMode } = useDesignTokens();

  const [isDeleting, setIsDeleting] = useState(false);

  const handleThemeChange = (mode: ThemeOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(mode);
  };

  const handleDeleteAccount = () => {
    if (Platform.OS === "web") {
      if (confirm("Are you sure you want to delete all your data? This action cannot be undone.")) {
        performDeleteAccount();
      }
    } else {
      Alert.alert(
        "Delete Account Data",
        "Are you sure you want to delete all your data? This action cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDeleteAccount },
        ]
      );
    }
  };

  const performDeleteAccount = async () => {
    setIsDeleting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await clearSearchHistory();
      await clearFavorites();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === "web") {
        alert("All data has been deleted successfully.");
      } else {
        Alert.alert("Success", "All data has been deleted successfully.");
      }
    } catch (error) {
      console.error("Failed to delete data:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const themeOptions: { value: ThemeOption; label: string; icon: string }[] = [
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
    { value: "system", label: "System", icon: "smartphone" },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="moon" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Appearance
          </Text>
        </View>

        <View style={styles.themeOptions}>
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => handleThemeChange(option.value)}
              style={({ pressed }) => [
                styles.themeOption,
                { 
                  backgroundColor: themeMode === option.value 
                    ? theme.colors.primary 
                    : theme.colors.muted,
                  opacity: pressed ? 0.7 : 1 
                }
              ]}
            >
              <Feather 
                name={option.icon as any} 
                size={18} 
                color={themeMode === option.value ? "#fff" : theme.colors.foreground} 
              />
              <Text style={[
                styles.themeOptionText, 
                { color: themeMode === option.value ? "#fff" : theme.colors.foreground }
              ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="info" size={20} color={theme.colors.primary} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            About
          </Text>
        </View>

        <Pressable 
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Privacy Policy
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <Pressable 
          style={({ pressed }) => [
            styles.menuItem, 
            { borderBottomColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }
          ]}
        >
          <Text style={[styles.menuItemText, { color: theme.colors.foreground }]}>
            Terms of Service
          </Text>
          <Feather name="chevron-right" size={20} color={theme.colors.mutedForeground} />
        </Pressable>

        <View style={styles.versionContainer}>
          <Text style={[styles.versionText, { color: theme.colors.mutedForeground }]}>
            Version 1.0.0
          </Text>
        </View>
      </View>

      <View style={[styles.section, styles.dangerSection, { backgroundColor: theme.colors.card }]}>
        <View style={styles.sectionHeader}>
          <Feather name="alert-triangle" size={20} color={theme.colors.danger} />
          <Text style={[styles.sectionTitle, { color: theme.colors.foreground }]}>
            Account
          </Text>
        </View>

        <Text style={[styles.warningText, { color: theme.colors.mutedForeground }]}>
          Deleting your account will permanently remove all your scan history, favorites, and saved data.
        </Text>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          style={({ pressed }) => [
            styles.deleteButton,
            { 
              backgroundColor: theme.colors.danger,
              opacity: pressed || isDeleting ? 0.7 : 1 
            }
          ]}
        >
          <Feather name="trash-2" size={18} color="#fff" />
          <Text style={styles.deleteButtonText}>
            {isDeleting ? "Deleting..." : "Delete All Data"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  dangerSection: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  themeOptions: {
    flexDirection: "row",
    gap: 10,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  themeOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  menuItemText: {
    fontSize: 16,
  },
  versionContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  versionText: {
    fontSize: 13,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
