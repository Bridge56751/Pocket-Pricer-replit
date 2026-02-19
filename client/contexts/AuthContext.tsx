import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AuthContextType {
  isLoading: boolean;
  getDeviceId: () => Promise<string>;
  getScansUsed: () => Promise<number>;
  incrementScans: () => Promise<number>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEVICE_ID_KEY = "@pocket_pricer_device_id";
const SCANS_KEY = "@pocket_pricer_guest_scans";

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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getOrCreateDeviceId().finally(() => setIsLoading(false));
  }, []);

  const getScansUsed = async (): Promise<number> => {
    try {
      const scans = await AsyncStorage.getItem(SCANS_KEY);
      return scans ? parseInt(scans, 10) : 0;
    } catch {
      return 0;
    }
  };

  const incrementScans = async (): Promise<number> => {
    try {
      const current = await getScansUsed();
      const newCount = current + 1;
      await AsyncStorage.setItem(SCANS_KEY, newCount.toString());
      return newCount;
    } catch {
      return 0;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        getDeviceId: getOrCreateDeviceId,
        getScansUsed,
        incrementScans,
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
