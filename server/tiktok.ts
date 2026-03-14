import { createHash } from "crypto";

const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID;
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET;

const TIKTOK_API_URL = "https://business-api.tiktok.com/open_api/v1.3/app/track/";
const TIKTOK_TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/app/token/";

function isConfigured(): boolean {
  return !!(TIKTOK_APP_ID && TIKTOK_APP_SECRET);
}

function hashId(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  try {
    const res = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: TIKTOK_APP_ID, secret: TIKTOK_APP_SECRET }),
    });
    const data = await res.json();
    if (data.code === 0 && data.data?.access_token) {
      cachedAccessToken = data.data.access_token;
      const expiresIn = (data.data.token_expire_time || 7776000) - 3600;
      tokenExpiresAt = Date.now() + expiresIn * 1000;
      console.log("TikTok access token obtained, expires in", data.data.token_expire_time, "seconds");
      return cachedAccessToken;
    } else {
      console.error("TikTok token fetch failed:", JSON.stringify(data));
      return null;
    }
  } catch (err: any) {
    console.error("TikTok token fetch error:", err?.message);
    return null;
  }
}

function sendEvent(
  eventName: string,
  eventId: string,
  context: object,
  properties: object
): void {
  if (!isConfigured()) return;

  getAccessToken().then((accessToken) => {
    if (!accessToken) {
      console.error("TikTok: no access token, skipping event", eventName);
      return;
    }

    const body = {
      app_id: TIKTOK_APP_ID,
      event: eventName,
      event_id: eventId,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      context,
      properties,
    };

    fetch(TIKTOK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          console.error("TikTok App Events API error:", res.status, text);
        } else {
          console.log(`TikTok event sent [${eventName}] status:${res.status}`, text);
        }
      })
      .catch((err: any) => {
        console.error("TikTok event send error:", err?.message);
      });
  });
}

export function logTikTokScanEvent(
  deviceId: string,
  isPro: boolean,
  productName: string
): void {
  sendEvent(
    "Search",
    `scan_${deviceId}_${Date.now()}`,
    {
      user: {
        external_id: hashId(deviceId),
      },
    },
    {
      query: productName,
      content_type: "product",
      description: isPro ? "pro_scan" : "free_scan",
    }
  );
}

export function logTikTokSubscriptionEvent(
  userId: string,
  eventType: "Subscribe" | "StartTrial",
  value: number,
  currency: string
): void {
  sendEvent(
    eventType,
    `sub_${userId}_${Date.now()}`,
    {
      user: {
        external_id: hashId(userId),
      },
    },
    {
      currency,
      value: value.toString(),
      content_type: "subscription",
    }
  );
}

export function logTikTokEbaySearchEvent(
  deviceId: string,
  isPro: boolean,
  searchQuery: string
): void {
  sendEvent(
    "ViewContent",
    `ebay_${deviceId}_${Date.now()}`,
    {
      user: {
        external_id: hashId(deviceId),
      },
    },
    {
      content_name: searchQuery,
      content_type: "ebay_sold",
      description: isPro ? "pro" : "free",
    }
  );
}
