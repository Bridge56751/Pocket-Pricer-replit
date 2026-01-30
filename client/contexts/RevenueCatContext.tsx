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
  offeringsDebug: string;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
  identifyUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadOfferings: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [offeringsDebug, setOfferingsDebug] = useState<string>("");

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
      
      // Detailed logging
      console.log("RevenueCat: Full offerings object:", offerings);
      console.log("RevenueCat: Current offering:", offerings.current);
      console.log("RevenueCat: All offering keys:", Object.keys(offerings.all || {}));
      
      // Try to get packages from current offering
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        console.log("RevenueCat: Found", offerings.current.availablePackages.length, "packages in current");
        setPackages(offerings.current.availablePackages);
        return;
      }
      
      // Try to get packages from 'default' offering directly
      if (offerings.all?.default?.availablePackages?.length > 0) {
        console.log("RevenueCat: Found packages in 'default' offering");
        setPackages(offerings.all.default.availablePackages);
        return;
      }
      
      // Try any available offering
      const allOfferingsArray = Object.values(offerings.all || {});
      for (const offering of allOfferingsArray) {
        if (offering.availablePackages?.length > 0) {
          console.log("RevenueCat: Found packages in offering:", offering.identifier);
          setPackages(offering.availablePackages);
          return;
        }
      }
      
      console.log("RevenueCat: No packages found in any offering");
      setOfferingsDebug(JSON.stringify(offerings, null, 2));
      
      if (retryCount < 3) {
        console.log("RevenueCat: Retrying in 3 seconds...");
        setTimeout(() => loadOfferings(retryCount + 1), 3000);
      }
    } catch (error: any) {
      console.error("Failed to load offerings:", error);
      console.error("Error details:", error?.message, error?.code);
      setOfferingsDebug(`Error: ${error?.message || error}`);
      if (retryCount < 3) {
        setTimeout(() => loadOfferings(retryCount + 1), 3000);
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

  const reloadOfferings = async () => {
    setOfferingsDebug("Reloading...");
    await loadOfferings(0);
  };

  return (
    <RevenueCatContext.Provider
      value={{
        isReady,
        customerInfo,
        packages,
        isPro,
        offeringsDebug,
        purchasePackage,
        restorePurchases,
        refreshCustomerInfo,
        identifyUser,
        logout,
        reloadOfferings,
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
