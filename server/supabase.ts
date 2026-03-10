import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase analytics connected");
  } catch (err: any) {
    console.warn("Supabase init failed:", err.message, "— analytics disabled");
    supabase = null;
  }
} else {
  console.warn("Supabase credentials missing — analytics disabled");
}

function safeLog(promise: PromiseLike<any>, label: string) {
  Promise.resolve(promise).catch((err) => {
    console.warn(`Supabase ${label} error:`, err?.message || err);
  });
}

export function logScanEvent(
  deviceId: string,
  isPro: boolean,
  productName: string,
  listingsCount: number,
  pricedCount: number
) {
  if (!supabase) return;

  try {
    safeLog(
      supabase
        .from("scan_events")
        .insert({
          device_id: deviceId,
          is_pro: isPro,
          product_name: productName,
          listings_count: listingsCount,
          priced_count: pricedCount,
        })
        .then(({ error }) => {
          if (error) console.warn("Supabase scan_events error:", error.message);
        }),
      "scan_events insert"
    );

    upsertDevice(deviceId, isPro, "scan");
  } catch (err: any) {
    console.warn("Supabase logScanEvent error:", err?.message);
  }
}

export function logEbaySearchEvent(
  deviceId: string,
  isPro: boolean,
  searchQuery: string,
  isBroad: boolean,
  resultsCount: number,
  avgSoldPrice: number
) {
  if (!supabase) return;

  try {
    safeLog(
      supabase
        .from("ebay_search_events")
        .insert({
          device_id: deviceId,
          is_pro: isPro,
          search_query: searchQuery,
          is_broad: isBroad,
          results_count: resultsCount,
          avg_sold_price: avgSoldPrice,
        })
        .then(({ error }) => {
          if (error) console.warn("Supabase ebay_search_events error:", error.message);
        }),
      "ebay_search_events insert"
    );

    upsertDevice(deviceId, isPro, "ebay");
  } catch (err: any) {
    console.warn("Supabase logEbaySearchEvent error:", err?.message);
  }
}

function upsertDevice(deviceId: string, isPro: boolean, eventType: "scan" | "ebay") {
  if (!supabase) return;

  safeLog(
    supabase
      .from("devices")
      .select("device_id, total_scans, total_ebay_searches")
      .eq("device_id", deviceId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn("Supabase device lookup error:", error.message);
          return;
        }

        const now = new Date().toISOString();

        if (data) {
          const updates: Record<string, unknown> = {
            is_pro: isPro,
            last_seen: now,
          };
          if (eventType === "scan") {
            updates.total_scans = (data.total_scans || 0) + 1;
          } else {
            updates.total_ebay_searches = (data.total_ebay_searches || 0) + 1;
          }

          safeLog(
            supabase!
              .from("devices")
              .update(updates)
              .eq("device_id", deviceId)
              .then(({ error: updateError }) => {
                if (updateError) console.warn("Supabase device update error:", updateError.message);
              }),
            "device update"
          );
        } else {
          safeLog(
            supabase!
              .from("devices")
              .insert({
                device_id: deviceId,
                is_pro: isPro,
                first_seen: now,
                last_seen: now,
                total_scans: eventType === "scan" ? 1 : 0,
                total_ebay_searches: eventType === "ebay" ? 1 : 0,
              })
              .then(({ error: insertError }) => {
                if (insertError) console.warn("Supabase device insert error:", insertError.message);
              }),
            "device insert"
          );
        }
      }),
    "device upsert"
  );
}
