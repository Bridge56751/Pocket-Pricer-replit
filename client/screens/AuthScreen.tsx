import React, { useState, useEffect } from "react";
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
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

const appIcon = require("../../assets/images/icon.png");

WebBrowser.maybeCompleteAuthSession();

export default function AuthScreen() {
  const { theme } = useDesignTokens();
  const insets = useSafeAreaInsets();
  const { login, signup, socialLogin } = useAuth();
  
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [isGoogleAvailable, setIsGoogleAvailable] = useState(false);

  useEffect(() => {
    checkAppleAvailability();
    checkGoogleAvailability();
  }, []);

  const checkGoogleAvailability = () => {
    // Google Sign-In disabled - requires OAuth configuration
    setIsGoogleAvailable(false);
  };

  const checkAppleAvailability = async () => {
    if (Platform.OS === "ios") {
      try {
        const AppleAuth = await import("expo-apple-authentication");
        const available = await AppleAuth.isAvailableAsync();
        setIsAppleAvailable(available);
      } catch {
        setIsAppleAvailable(false);
      }
    }
  };


  const handleGoogleSignIn = async () => {
    setError("");
    setIsSocialLoading("google");
    
    try {
      const AuthSession = await import("expo-auth-session");
      const Google = await import("expo-auth-session/providers/google");
      
      const config = {
        expoClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      };

      const [request, response, promptAsync] = Google.useIdTokenAuthRequest(config);
      
      const result = await promptAsync();
      
      if (result.type === "success") {
        const { id_token } = result.params;
        
        const userInfoResponse = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`
        );
        const userInfo = await userInfoResponse.json();
        
        const loginResult = await socialLogin("google", {
          email: userInfo.email,
          name: userInfo.name,
          googleId: userInfo.sub,
        });

        if (!loginResult.success) {
          setError(loginResult.error || "Google sign-in failed");
        }
      } else if (result.type !== "cancel") {
        setError("Google sign-in failed");
      }
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      setError("Google sign-in is not available");
    } finally {
      setIsSocialLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    setError("");
    setIsSocialLoading("apple");
    
    try {
      const AppleAuth = await import("expo-apple-authentication");
      
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      const result = await socialLogin("apple", {
        email: credential.email,
        name: credential.fullName?.givenName 
          ? `${credential.fullName.givenName} ${credential.fullName.familyName || ""}`.trim()
          : undefined,
        appleId: credential.user,
      });

      if (!result.success) {
        setError(result.error || "Apple sign-in failed");
      }
    } catch (err: any) {
      if (err.code !== "ERR_REQUEST_CANCELED") {
        setError("Apple sign-in failed");
      }
    } finally {
      setIsSocialLoading(null);
    }
  };

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
          <Image source={appIcon} style={styles.logoImage} contentFit="contain" />
          <Text style={[styles.appName, { color: theme.colors.foreground }]}>
            Pocket Pricer
          </Text>
          <Text style={[styles.tagline, { color: theme.colors.mutedForeground }]}>
            Find the best prices for your reselling business
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.socialButtons}>
            {isGoogleAvailable ? (
              <Pressable
                style={[styles.socialButton, { backgroundColor: theme.colors.card }]}
                onPress={handleGoogleSignIn}
                disabled={isSocialLoading !== null}
              >
                {isSocialLoading === "google" ? (
                  <ActivityIndicator color={theme.colors.foreground} size="small" />
                ) : (
                  <>
                    <View style={styles.googleIcon}>
                      <Text style={styles.googleG}>G</Text>
                    </View>
                    <Text style={[styles.socialButtonText, { color: theme.colors.foreground }]}>
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}

            {isAppleAvailable ? (
              <Pressable
                style={[styles.socialButton, styles.appleButton]}
                onPress={handleAppleSignIn}
                disabled={isSocialLoading !== null}
              >
                {isSocialLoading === "apple" ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="command" size={20} color="#fff" />
                    <Text style={[styles.socialButtonText, { color: "#fff" }]}>
                      Continue with Apple
                    </Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          {(isGoogleAvailable || isAppleAvailable) ? (
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.dividerText, { color: theme.colors.mutedForeground }]}>
                or
              </Text>
              <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
            </View>
          ) : null}

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
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 24,
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
  socialButtons: {
    gap: 12,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 12,
  },
  appleButton: {
    backgroundColor: "#000",
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  googleG: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4285F4",
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 8,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
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
