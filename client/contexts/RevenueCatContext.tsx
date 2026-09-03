import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as Application from "expo-application";
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";

const IOS_REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || "";
const ANDROID_REVENUECAT_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY || "";
const REVENUECAT_API_KEY =
  Platform.OS === "android"
    ? ANDROID_REVENUECAT_API_KEY
    : IOS_REVENUECAT_API_KEY;
const PRO_ENTITLEMENT_IDS = ["Pocket Pricer Pro", "pro", "Pro"] as const;

const hasActiveProEntitlement = (info: CustomerInfo | null) => {
  if (!info) return false;
  return PRO_ENTITLEMENT_IDS.some(
    (identifier) => identifier in info.entitlements.active,
  );
};

// Group C / P0-1A: read the same device ID AuthContext stores so we can
// alias it onto the user's RevenueCat subscriber record. This MUST mirror
// the implementation in client/contexts/AuthContext.tsx — both files compute
// the same string and share storage keys. We re-implement here (instead of
// importing) because RevenueCatProvider mounts ABOVE AuthProvider in the
// React tree, so the AuthContext hook isn't available yet when this runs.
const SECURE_DEVICE_ID_KEY = "pocket_pricer_device_id_v2";

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

interface RevenueCatContextType {
  isReady: boolean;
  purchasesAvailable: boolean;
  customerInfo: CustomerInfo | null;
  packages: PurchasesPackage[];
  isPro: boolean;
  offeringsDebug: string;
  purchasePackage: (
    pkg: PurchasesPackage,
  ) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
  identifyUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadOfferings: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(
  undefined,
);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [offeringsDebug, setOfferingsDebug] = useState<string>("");
  const [purchasesAvailable, setPurchasesAvailable] = useState(false);
  const purchasesAvailableRef = React.useRef<boolean | null>(null);
  const offeringsRetryTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const offeringsRequestIdRef = React.useRef(0);

  useEffect(() => {
    initRevenueCat();
    return () => {
      offeringsRequestIdRef.current += 1;
      if (offeringsRetryTimerRef.current) {
        clearTimeout(offeringsRetryTimerRef.current);
      }
    };
    // RevenueCat must initialize exactly once for this provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initRevenueCat = async () => {
    try {
      if (Platform.OS === "web") {
        console.log("RevenueCat: Web platform - using mock mode");
        purchasesAvailableRef.current = false;
        setPurchasesAvailable(false);
        setOfferingsDebug(
          "Subscriptions are only available in the iOS and Android app.",
        );
        setIsReady(true);
        return;
      }

      const Constants = await import("expo-constants");
      const isExpoGo = Constants.default?.appOwnership === "expo";
      if (isExpoGo) {
        console.log("RevenueCat: Expo Go detected - using mock mode");
        purchasesAvailableRef.current = false;
        setPurchasesAvailable(false);
        setOfferingsDebug(
          "RevenueCat pricing is unavailable in Expo Go. Use a development or TestFlight build to test subscriptions.",
        );
        setIsReady(true);
        return;
      }

      if (!REVENUECAT_API_KEY) {
        console.warn("RevenueCat API key not configured");
        purchasesAvailableRef.current = false;
        setPurchasesAvailable(false);
        setOfferingsDebug("Subscription pricing is not configured.");
        setIsReady(true);
        return;
      }

      Purchases.setLogLevel(LOG_LEVEL.ERROR);

      const alreadyConfigured = await Purchases.isConfigured();
      if (!alreadyConfigured) {
        await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      }
      purchasesAvailableRef.current = true;
      setPurchasesAvailable(true);

      // Group C / P0-1A: alias the user's anonymous RevenueCat ID to their
      // device_id immediately after configure(). This is what enables the
      // upcoming server-side Pro verification (P0-1) to look up entitlements
      // by device_id. Without this call, RevenueCat only knows the user as
      // their auto-generated anonymous ID, which the server has no way to
      // map back to.
      //
      // What happens here for an existing Pro subscriber:
      //   1. configure() reads the locally-stored anon ID like
      //      $RCAnonymousID:97887abdef… (created on their first install)
      //   2. logIn(deviceId) tells RevenueCat: "the subscriber I've been
      //      talking to is also known as hw_FCE7550F-5D69…"
      //   3. RevenueCat creates an alias linking both IDs to the same
      //      subscriber record. Their Pro entitlement is now reachable via
      //      either ID.
      //
      // What happens for a brand-new user:
      //   - configure() creates a fresh anonymous ID
      //   - logIn(deviceId) immediately aliases it to the device_id
      //   - When they later subscribe, the receipt is attached to that
      //     subscriber record. From day 1 their device_id is the canonical
      //     identifier — no migration needed.
      //
      // Failure mode:
      //   - getOrCreateDeviceId() throws → wrapped in try/catch, alias
      //     skipped, RevenueCat still works with anonymous ID
      //   - logIn() throws → caught, logged, doesn't break Pro detection
      try {
        const deviceId = await getOrCreateDeviceId();
        if (deviceId) {
          const result = await Purchases.logIn(deviceId);
          console.log(
            `RevenueCat: aliased anonymous subscriber to device_id (created=${result.created})`,
          );
        }
      } catch (logInError) {
        console.error("RevenueCat logIn failed:", logInError);
        // Continue — Pro detection still works on the anonymous ID, just
        // without the device_id alias the server-side fix needs.
      }

      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      await loadOfferings();

      Purchases.addCustomerInfoUpdateListener((info) => {
        setCustomerInfo(info);
      });

      setIsReady(true);
    } catch (error) {
      console.error("RevenueCat init error:", error);
      purchasesAvailableRef.current = false;
      setPurchasesAvailable(false);
      setOfferingsDebug("Subscription pricing could not be initialized.");
      setIsReady(true);
    }
  };

  const loadOfferings = async (
    retryCount = 0,
    requestId = ++offeringsRequestIdRef.current,
  ) => {
    if (purchasesAvailableRef.current !== true) {
      console.log(
        "RevenueCat: Skipping offerings because purchases are unavailable",
      );
      return;
    }

    try {
      console.log("RevenueCat: Loading offerings, attempt", retryCount + 1);
      const offerings = await Purchases.getOfferings();
      if (requestId !== offeringsRequestIdRef.current) return;

      // Detailed logging
      console.log("RevenueCat: Full offerings object:", offerings);
      console.log("RevenueCat: Current offering:", offerings.current);
      console.log(
        "RevenueCat: All offering keys:",
        Object.keys(offerings.all || {}),
      );

      // Try to get packages from current offering
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        console.log(
          "RevenueCat: Found",
          offerings.current.availablePackages.length,
          "packages in current",
        );
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
          console.log(
            "RevenueCat: Found packages in offering:",
            offering.identifier,
          );
          setPackages(offering.availablePackages);
          return;
        }
      }

      console.log("RevenueCat: No packages found in any offering");
      setOfferingsDebug(JSON.stringify(offerings, null, 2));

      if (retryCount < 3) {
        console.log("RevenueCat: Retrying in 3 seconds...");
        offeringsRetryTimerRef.current = setTimeout(
          () => loadOfferings(retryCount + 1, requestId),
          3000,
        );
      }
    } catch (error: any) {
      if (requestId !== offeringsRequestIdRef.current) return;
      console.error("Failed to load offerings:", error);
      console.error("Error details:", error?.message, error?.code);
      setOfferingsDebug(`Error: ${error?.message || error}`);
      if (retryCount < 3) {
        offeringsRetryTimerRef.current = setTimeout(
          () => loadOfferings(retryCount + 1, requestId),
          3000,
        );
      }
    }
  };

  const identifyUser = async (userId: string) => {
    try {
      if (purchasesAvailableRef.current !== true) return;

      const { customerInfo } = await Purchases.logIn(userId);
      setCustomerInfo(customerInfo);
    } catch (error) {
      console.error("Failed to identify user:", error);
    }
  };

  const logout = async () => {
    try {
      if (purchasesAvailableRef.current !== true) return;

      const info = await Purchases.logOut();
      setCustomerInfo(info);
    } catch (error) {
      console.error("Failed to logout from RevenueCat:", error);
    }
  };

  const isPro = (() => {
    return hasActiveProEntitlement(customerInfo);
  })();

  const purchasePackage = async (
    pkg: PurchasesPackage,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (purchasesAvailableRef.current !== true) {
        return {
          success: false,
          error:
            Platform.OS === "web"
              ? "Purchases are only available on iOS and Android"
              : "Purchases are unavailable in Expo Go. Use a development or TestFlight build.",
        };
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(customerInfo);

      const isNowPro = hasActiveProEntitlement(customerInfo);

      if (isNowPro) {
        return { success: true };
      } else {
        return {
          success: false,
          error: "Purchase completed but subscription not activated",
        };
      }
    } catch (error: any) {
      if (error.userCancelled) {
        return { success: false, error: "Purchase cancelled" };
      }
      return { success: false, error: error.message || "Purchase failed" };
    }
  };

  const restorePurchases = async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    try {
      if (purchasesAvailableRef.current !== true) {
        return {
          success: false,
          error:
            Platform.OS === "web"
              ? "Restore is only available on iOS and Android"
              : "Restore is unavailable in Expo Go. Use a development or TestFlight build.",
        };
      }

      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);

      const isNowPro = hasActiveProEntitlement(info);

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
      if (purchasesAvailableRef.current !== true) return;

      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (error) {
      console.error("Failed to refresh customer info:", error);
    }
  };

  const reloadOfferings = async () => {
    offeringsRequestIdRef.current += 1;
    if (offeringsRetryTimerRef.current) {
      clearTimeout(offeringsRetryTimerRef.current);
      offeringsRetryTimerRef.current = null;
    }
    setOfferingsDebug("Reloading...");
    if (purchasesAvailableRef.current === true) {
      await loadOfferings(0);
      return;
    }
    await initRevenueCat();
  };

  return (
    <RevenueCatContext.Provider
      value={{
        isReady,
        purchasesAvailable,
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
