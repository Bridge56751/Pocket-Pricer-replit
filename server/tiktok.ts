import { createHash } from "crypto";

const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID;
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET;

const TIKTOK_API_URL = "https://business-api.tiktok.com/open_api/v1.3/app/track/";

function isConfigured(): boolean {
  return !!(TIKTOK_APP_ID && TIKTOK_APP_SECRET);
}

function hashId(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

function sendEvent(
  eventName: string,
  eventId: string,
  context: object,
  properties: object
): void {
  if (!isConfigured()) return;

  const body = {
    app_id: TIKTOK_APP_ID,
    secret: TIKTOK_APP_SECRET,
    event: eventName,
    event_id: eventId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    test_event_code: "TEST08001",
    context,
    properties,
  };

  fetch(TIKTOK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
