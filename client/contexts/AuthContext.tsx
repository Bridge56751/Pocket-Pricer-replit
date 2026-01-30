import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Purchases from "react-native-purchases";
import { getApiUrl } from "@/lib/query-client";

interface User {
  id: string;
  email: string;
  subscriptionStatus: "free" | "active";
  searchesRemaining: number;
}

interface SocialLoginData {
  email?: string | null;
  name?: string;
  googleId?: string;
  appleId?: string;
}

interface AuthResult {
  success: boolean;
  error?: string;
  deviceLimitReached?: boolean;
  requiresVerification?: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (email: string, password: string) => Promise<AuthResult>;
  verifyEmail: (email: string, code: string) => Promise<AuthResult>;
  socialLogin: (provider: "google" | "apple", data: SocialLoginData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = "@pocket_pricer_auth_token";
const DEVICE_ID_KEY = "@pocket_pricer_device_id";

const getDeviceName = (): string => {
  if (Platform.OS === "web") {
    return "Web Browser";
  }
  const brand = Device.brand || "";
  const model = Device.modelName || "";
  return `${brand} ${model}`.trim() || `${Platform.OS} Device`;
};

const getOrCreateDeviceId = async (): Promise<string> => {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
        await fetchUser(storedToken);
      }
    } catch (error) {
      console.error("Failed to load auth:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUser = async (authToken: string) => {
    try {
      const response = await fetch(new URL("/api/auth/me", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to fetch user:", error);
    }
  };

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceName();
      
      const response = await fetch(new URL("/api/auth/login", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId, deviceName }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
        if (data.deviceId) {
          await AsyncStorage.setItem(DEVICE_ID_KEY, data.deviceId);
        }
        setToken(data.token);
        setUser(data.user);
        
        // Identify user with RevenueCat
        if (Platform.OS !== "web" && data.user?.id) {
          try {
            await Purchases.logIn(data.user.id);
          } catch (e) {
            console.log("RevenueCat identify error:", e);
          }
        }
        
        return { success: true };
      } else {
        return { 
          success: false, 
          error: data.message || data.error || "Login failed",
          deviceLimitReached: data.deviceLimitReached,
          requiresVerification: data.requiresVerification,
          email: data.email
        };
      }
    } catch (error) {
      return { success: false, error: "Connection failed" };
    }
  };

  const signup = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceName();
      
      const response = await fetch(new URL("/api/auth/signup", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, deviceId, deviceName }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        if (data.requiresVerification) {
          return { 
            success: true, 
            requiresVerification: true,
            email: data.email
          };
        }
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
        if (data.deviceId) {
          await AsyncStorage.setItem(DEVICE_ID_KEY, data.deviceId);
        }
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || "Signup failed" };
      }
    } catch (error) {
      return { success: false, error: "Connection failed" };
    }
  };

  const verifyEmail = async (email: string, code: string): Promise<AuthResult> => {
    try {
      const deviceId = await getOrCreateDeviceId();
      const deviceName = getDeviceName();
      
      const response = await fetch(new URL("/api/auth/verify-email", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, deviceId, deviceName }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
        if (data.deviceId) {
          await AsyncStorage.setItem(DEVICE_ID_KEY, data.deviceId);
        }
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || "Verification failed" };
      }
    } catch (error) {
      return { success: false, error: "Connection failed" };
    }
  };

  const socialLogin = async (provider: "google" | "apple", data: SocialLoginData) => {
    try {
      const response = await fetch(new URL("/api/auth/social", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, ...data }),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, result.token);
        setToken(result.token);
        setUser(result.user);
        
        // Identify user with RevenueCat
        if (Platform.OS !== "web" && result.user?.id) {
          try {
            await Purchases.logIn(result.user.id);
          } catch (e) {
            console.log("RevenueCat identify error:", e);
          }
        }
        
        return { success: true };
      } else {
        return { success: false, error: result.error || "Social login failed" };
      }
    } catch (error) {
      return { success: false, error: "Connection failed" };
    }
  };

  const logout = async () => {
    try {
      const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (token && deviceId) {
        await fetch(new URL("/api/auth/logout", getApiUrl()).toString(), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ deviceId }),
        });
      }
    } catch (error) {
      console.error("Logout API error:", error);
    }
    
    // Logout from RevenueCat
    if (Platform.OS !== "web") {
      try {
        await Purchases.logOut();
      } catch (e) {
        console.log("RevenueCat logout error:", e);
      }
    }
    
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser(token);
    }
  };

  const checkSubscription = async () => {
    if (!token) return;
    
    try {
      // Check RevenueCat subscription status on native platforms
      if (Platform.OS !== "web") {
        const customerInfo = await Purchases.getCustomerInfo();
        const isPro = "pro" in customerInfo.entitlements.active || "Pro" in customerInfo.entitlements.active || "Pocket Pricer Pro" in customerInfo.entitlements.active;
        
        // Sync with backend
        const response = await fetch(new URL("/api/subscription/sync", getApiUrl()).toString(), {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ 
            isPro,
            revenuecatUserId: customerInfo.originalAppUserId 
          }),
        });
        
        if (response.ok) {
          await refreshUser();
        }
      } else {
        // Web fallback - just refresh user
        await refreshUser();
      }
    } catch (error) {
      console.error("Failed to check subscription:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        verifyEmail,
        socialLogin,
        logout,
        refreshUser,
        checkSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
