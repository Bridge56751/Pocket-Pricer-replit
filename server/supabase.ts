import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase analytics connected");
  } catch (err: any) {
    console.error("Supabase init failed:", err.message, "— analytics disabled");
    supabase = null;
  }
} else {
  console.error("Supabase credentials missing — analytics disabled");
}

export { supabase };

export async function initScanImagesBucket(): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.storage.createBucket("scan-images", {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    const alreadyExists =
      !error ||
      error.message === "The resource already exists" ||
      (error as any).status === 409 ||
      (error as any).statusCode === 409;
    if (error && !alreadyExists) {
      console.error("Supabase bucket init error:", error.message);
    } else {
      console.log("Supabase scan-images bucket ready");
    }
  } catch (err: any) {
    console.error("Supabase bucket init failed:", err?.message);
  }
}

function safeLog(promise: PromiseLike<any>, label: string) {
  Promise.resolve(promise).catch((err) => {
    console.error(`Supabase ${label} error:`, err?.message || err);
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
          if (error) console.error("Supabase scan_events error:", error.message);
        }),
      "scan_events insert"
    );

    upsertDevice(deviceId, isPro, "scan");
  } catch (err: any) {
    console.error("Supabase logScanEvent error:", err?.message);
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
          if (error) console.error("Supabase ebay_search_events error:", error.message);
        }),
      "ebay_search_events insert"
    );

    upsertDevice(deviceId, isPro, "ebay");
  } catch (err: any) {
    console.error("Supabase logEbaySearchEvent error:", err?.message);
  }
}

export async function getDeviceStats(deviceId: string, tzOffsetMinutes: number = 0): Promise<{
  memberDays: number;
  scansToday: number;
  streak: number;
}> {
  const fallback = { memberDays: 0, scansToday: 0, streak: 0 };
  if (!supabase) return fallback;

  function toLocalDate(utcDate: Date): Date {
    const localMs = utcDate.getTime() - tzOffsetMinutes * 60 * 1000;
    const shifted = new Date(localMs);
    return new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  }

  try {
    const { data: device } = await supabase
      .from("devices")
      .select("total_scans, first_seen")
      .eq("device_id", deviceId)
      .maybeSingle();

    let memberDays = 0;
    if (device?.first_seen) {
      const firstDay = toLocalDate(new Date(device.first_seen));
      const today = toLocalDate(new Date());
      memberDays = Math.max(1, Math.round((today.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }

    const todayLocalStart = toLocalDate(new Date());
    const todayStartUtc = new Date(todayLocalStart.getTime() + tzOffsetMinutes * 60 * 1000);

    const { count: scansToday } = await supabase
      .from("scan_events")
      .select("*", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", todayStartUtc.toISOString());

    const { data: scanDays } = await supabase
      .from("scan_events")
      .select("created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(500);

    let streak = 0;
    if (scanDays && scanDays.length > 0) {
      const uniqueDays = new Set<string>();
      for (const row of scanDays) {
        const d = toLocalDate(new Date(row.created_at));
        uniqueDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }

      const checkDate = toLocalDate(new Date());
      const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

      if (!uniqueDays.has(todayKey)) {
        checkDate.setDate(checkDate.getDate() - 1);
      }

      while (true) {
        const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
        if (uniqueDays.has(key)) {
          streak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    return { memberDays, scansToday: scansToday || 0, streak };
  } catch (err: any) {
    console.error("getDeviceStats error:", err?.message);
    return fallback;
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
          console.error("Supabase device lookup error:", error.message);
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
                if (updateError) console.error("Supabase device update error:", updateError.message);
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
                if (insertError) console.error("Supabase device insert error:", insertError.message);
              }),
            "device insert"
          );
        }
      }),
    "device upsert"
  );
}
