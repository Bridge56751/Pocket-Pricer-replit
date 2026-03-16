import { Platform } from "react-native";

const TIKTOK_APP_ID = "6758423765";
const TIKTOK_TIKTOK_APP_ID = "7616919078825590792";
const TIKTOK_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN ?? "";

let initialized = false;

async function isExpoGo(): Promise<boolean> {
  try {
    const Constants = await import("expo-constants");
    return Constants.default?.appOwnership === "expo";
  } catch {
    return false;
  }
}

export async function initTikTokSDK(): Promise<void> {
  if (Platform.OS === "web") return;
  if (initialized) return;

  try {
    if (await isExpoGo()) return;

    const TikTokBusiness = await import("react-native-tiktok-business-sdk");
    await TikTokBusiness.initializeSdk(
      TIKTOK_APP_ID,
      TIKTOK_TIKTOK_APP_ID,
      TIKTOK_ACCESS_TOKEN,
      false
    );
    initialized = true;
    console.log("TikTok SDK initialized");
  } catch (error: any) {
    console.log("TikTok SDK init failed:", error?.message);
  }
}

export async function logTikTokScanEvent(deviceId: string): Promise<void> {
  if (!initialized || Platform.OS === "web") return;
  try {
    const TikTokBusiness = await import("react-native-tiktok-business-sdk");
    await TikTokBusiness.trackEvent(
      TikTokBusiness.TikTokEventName.SEARCH,
      `scan_${deviceId}_${Date.now()}`
    );
  } catch (error: any) {
    console.log("TikTok scan event failed:", error?.message);
  }
}

export async function logTikTokStartTrialEvent(): Promise<void> {
  if (!initialized || Platform.OS === "web") return;
  try {
    const TikTokBusiness = await import("react-native-tiktok-business-sdk");
    await TikTokBusiness.trackEvent(
      TikTokBusiness.TikTokEventName.START_TRIAL,
      `trial_${Date.now()}`
    );
  } catch (error: any) {
    console.log("TikTok start trial event failed:", error?.message);
  }
}

export async function logTikTokSubscribeEvent(value: number, currency: string): Promise<void> {
  if (!initialized || Platform.OS === "web") return;
  try {
    const TikTokBusiness = await import("react-native-tiktok-business-sdk");
    await TikTokBusiness.trackEvent(
      TikTokBusiness.TikTokEventName.SUBSCRIBE,
      `sub_${Date.now()}`
    );
  } catch (error: any) {
    console.log("TikTok subscribe event failed:", error?.message);
  }
}
