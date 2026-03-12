import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Application from "expo-application";

interface AuthContextType {
  isLoading: boolean;
  getDeviceId: () => Promise<string>;
  getScansUsed: () => Promise<number>;
  incrementScans: () => Promise<number>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SECURE_DEVICE_ID_KEY = "pocket_pricer_device_id_v2";
const SCANS_SECURE_KEY = "pocket_pricer_guest_scans_v2";
const SCANS_ASYNC_KEY = "@pocket_pricer_guest_scans";

const getOrCreateDeviceId = async (): Promise<string> => {
  if (Platform.OS === "web") {
    try {
      let id = await AsyncStorage.getItem("@pocket_pricer_device_id");
      if (!id) {
        id = `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem("@pocket_pricer_device_id", id);
      }
      return id;
    } catch {
      return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  try {
    const stored = await SecureStore.getItemAsync(SECURE_DEVICE_ID_KEY);
    if (stored) return stored;
  } catch {}

  let hardwareId: string | null = null;
  try {
    if (Platform.OS === "ios") {
      hardwareId = await Application.getIosIdForVendorAsync();
    } else if (Platform.OS === "android") {
      hardwareId = Application.getAndroidId();
    }
  } catch {}

  const deviceId = hardwareId
    ? `hw_${hardwareId}`
    : `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    await SecureStore.setItemAsync(SECURE_DEVICE_ID_KEY, deviceId);
  } catch {}

  return deviceId;
};

const getScansUsed = async (): Promise<number> => {
  if (Platform.OS !== "web") {
    try {
      const val = await SecureStore.getItemAsync(SCANS_SECURE_KEY);
      if (val !== null) return parseInt(val, 10);
    } catch {}
  }
  try {
    const val = await AsyncStorage.getItem(SCANS_ASYNC_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
};

const incrementScans = async (): Promise<number> => {
  const current = await getScansUsed();
  const next = current + 1;
  if (Platform.OS !== "web") {
    try {
      await SecureStore.setItemAsync(SCANS_SECURE_KEY, next.toString());
    } catch {}
  }
  try {
    await AsyncStorage.setItem(SCANS_ASYNC_KEY, next.toString());
  } catch {}
  return next;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getOrCreateDeviceId().finally(() => setIsLoading(false));
  }, []);

  return (
    <AuthContext.Provider
      value={{ isLoading, getDeviceId: getOrCreateDeviceId, getScansUsed, incrementScans }}
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
