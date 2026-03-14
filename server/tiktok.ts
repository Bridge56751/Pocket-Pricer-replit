import { createHash } from "crypto";

const TIKTOK_PIXEL_ID = process.env.TIKTOK_PIXEL_ID;
const TIKTOK_ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;

const TIKTOK_API_URL = "https://business-api.tiktok.com/open_api/v1.3/pixel/track/";

function isConfigured(): boolean {
  return !!(TIKTOK_PIXEL_ID && TIKTOK_ACCESS_TOKEN);
}

function hashId(value: string): string {
  return createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

function sendEvent(eventName: string, eventId: string, context: object, properties: object): void {
  if (!isConfigured()) return;

  const body = {
    pixel_code: TIKTOK_PIXEL_ID,
    event: eventName,
    event_id: eventId,
    timestamp: new Date().toISOString(),
    context,
    properties,
  };

  fetch(TIKTOK_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": TIKTOK_ACCESS_TOKEN!,
    },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        console.error("TikTok Events API error:", res.status, text);
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
