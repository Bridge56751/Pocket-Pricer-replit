import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";

export default function AuthScreen() {
  const { theme } = useDesignTokens();
  const insets = useSafeAreaInsets();
  const { login, signup } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);
    setError("");

    const result = isLogin
      ? await login(email.trim(), password)
      : await signup(email.trim(), password);

    setIsLoading(false);

    if (!result.success) {
      setError(result.error || "Authentication failed");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <View style={[styles.logoBox, { backgroundColor: theme.colors.primary }]}>
            <Feather name="search" size={40} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: theme.colors.foreground }]}>
            Price It
          </Text>
          <Text style={[styles.tagline, { color: theme.colors.mutedForeground }]}>
            Find the best prices for your reselling business
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.tabContainer}>
            <Pressable
              style={[
                styles.tab,
                isLogin && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => {
                setIsLogin(true);
                setError("");
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: isLogin ? "#fff" : theme.colors.mutedForeground },
                ]}
              >
                Log In
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                !isLogin && { backgroundColor: theme.colors.primary },
              ]}
              onPress={() => {
                setIsLogin(false);
                setError("");
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: !isLogin ? "#fff" : theme.colors.mutedForeground },
                ]}
              >
                Sign Up
              </Text>
            </Pressable>
          </View>

          <View style={[styles.inputContainer, { backgroundColor: theme.colors.card }]}>
            <Feather name="mail" size={20} color={theme.colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: theme.colors.foreground }]}
              placeholder="Email"
              placeholderTextColor={theme.colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={[styles.inputContainer, { backgroundColor: theme.colors.card }]}>
            <Feather name="lock" size={20} color={theme.colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: theme.colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={theme.colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Feather name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.submitButton,
              { backgroundColor: theme.colors.primary },
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {isLogin ? "Log In" : "Create Account"}
              </Text>
            )}
          </Pressable>

          <View style={styles.freeTrialInfo}>
            <Feather name="gift" size={16} color={theme.colors.primary} />
            <Text style={[styles.freeTrialText, { color: theme.colors.mutedForeground }]}>
              Free accounts get 5 product scans
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    textAlign: "center",
  },
  formContainer: {
    gap: 16,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(128, 128, 128, 0.1)",
  },
  tabText: {
    fontSize: 16,
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 14,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  freeTrialInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  freeTrialText: {
    fontSize: 14,
  },
});
