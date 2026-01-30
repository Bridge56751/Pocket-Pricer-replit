import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Platform } from "react-native";
import Purchases, { 
  PurchasesPackage, 
  CustomerInfo,
  LOG_LEVEL 
} from "react-native-purchases";

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || "";

interface RevenueCatContextType {
  isReady: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];
  isPro: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
  identifyUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);

  useEffect(() => {
    initRevenueCat();
  }, []);

  const initRevenueCat = async () => {
    try {
      if (Platform.OS === "web") {
        console.log("RevenueCat: Web platform - using mock mode");
        setIsReady(true);
        return;
      }

      if (!REVENUECAT_API_KEY) {
        console.warn("RevenueCat API key not configured");
        setIsReady(true);
        return;
      }

      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      
      await loadOfferings();
      
      Purchases.addCustomerInfoUpdateListener((info) => {
        setCustomerInfo(info);
      });

      setIsReady(true);
    } catch (error) {
      console.error("RevenueCat init error:", error);
      setIsReady(true);
    }
  };

  const loadOfferings = async (retryCount = 0) => {
    try {
      console.log("RevenueCat: Loading offerings, attempt", retryCount + 1);
      const offerings = await Purchases.getOfferings();
      console.log("RevenueCat: Offerings response:", JSON.stringify(offerings, null, 2));
      
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        console.log("RevenueCat: Found", offerings.current.availablePackages.length, "packages");
        setPackages(offerings.current.availablePackages);
      } else {
        console.log("RevenueCat: No current offering or no packages available");
        console.log("RevenueCat: All offerings:", Object.keys(offerings.all || {}));
        
        if (retryCount < 2) {
          console.log("RevenueCat: Retrying in 2 seconds...");
          setTimeout(() => loadOfferings(retryCount + 1), 2000);
        }
      }
    } catch (error) {
      console.error("Failed to load offerings:", error);
      if (retryCount < 2) {
        setTimeout(() => loadOfferings(retryCount + 1), 2000);
      }
    }
  };

  const identifyUser = async (userId: string) => {
    try {
      if (Platform.OS === "web") return;
      
      const { customerInfo } = await Purchases.logIn(userId);
      setCustomerInfo(customerInfo);
    } catch (error) {
      console.error("Failed to identify user:", error);
    }
  };

  const logout = async () => {
    try {
      if (Platform.OS === "web") return;
      
      const info = await Purchases.logOut();
      setCustomerInfo(info);
    } catch (error) {
      console.error("Failed to logout from RevenueCat:", error);
    }
  };

  const isPro = (() => {
    if (!customerInfo) return false;
    
    const entitlements = customerInfo.entitlements.active;
    return "pro" in entitlements || "Pro" in entitlements || "Pocket Pricer Pro" in entitlements;
  })();

  const purchasePackage = async (pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> => {
    try {
      if (Platform.OS === "web") {
        return { success: false, error: "Purchases are only available on iOS and Android" };
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(customerInfo);
      
      const isNowPro = "pro" in customerInfo.entitlements.active || "Pro" in customerInfo.entitlements.active || "Pocket Pricer Pro" in customerInfo.entitlements.active;
      
      if (isNowPro) {
        return { success: true };
      } else {
        return { success: false, error: "Purchase completed but subscription not activated" };
      }
    } catch (error: any) {
      if (error.userCancelled) {
        return { success: false, error: "Purchase cancelled" };
      }
      return { success: false, error: error.message || "Purchase failed" };
    }
  };

  const restorePurchases = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      if (Platform.OS === "web") {
        return { success: false, error: "Restore is only available on iOS and Android" };
      }

      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      
      const isNowPro = "pro" in info.entitlements.active || "Pro" in info.entitlements.active || "Pocket Pricer Pro" in info.entitlements.active;
      
      if (isNowPro) {
        return { success: true };
      } else {
        return { success: false, error: "No active subscriptions found" };
      }
    } catch (error: any) {
      return { success: false, error: error.message || "Restore failed" };
    }
  };

  const refreshCustomerInfo = async () => {
    try {
      if (Platform.OS === "web") return;
      
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (error) {
      console.error("Failed to refresh customer info:", error);
    }
  };

  return (
    <RevenueCatContext.Provider
      value={{
        isReady,
        customerInfo,
        packages,
        isPro,
        purchasePackage,
        restorePurchases,
        refreshCustomerInfo,
        identifyUser,
        logout,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error("useRevenueCat must be used within a RevenueCatProvider");
  }
  return context;
}
