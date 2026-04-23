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
  totalScans: number;
}> {
  const fallback = { memberDays: 0, scansToday: 0, totalScans: 0 };
  if (!supabase) return fallback;

  const offsetMs = tzOffsetMinutes * 60 * 1000;

  function getLocalMidnightUtc(): Date {
    const shifted = new Date(Date.now() - offsetMs);
    const midnightUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    return new Date(midnightUtc + offsetMs);
  }

  try {
    const { data: device } = await supabase
      .from("devices")
      .select("total_scans, first_seen")
      .eq("device_id", deviceId)
      .maybeSingle();

    let memberDays = 0;
    if (device?.first_seen) {
      const firstShifted = new Date(new Date(device.first_seen).getTime() - offsetMs);
      const nowShifted = new Date(Date.now() - offsetMs);
      const firstDayUtc = Date.UTC(firstShifted.getUTCFullYear(), firstShifted.getUTCMonth(), firstShifted.getUTCDate());
      const todayUtc = Date.UTC(nowShifted.getUTCFullYear(), nowShifted.getUTCMonth(), nowShifted.getUTCDate());
      memberDays = Math.max(1, Math.round((todayUtc - firstDayUtc) / (1000 * 60 * 60 * 24)) + 1);
    }

    const todayStartUtc = getLocalMidnightUtc();

    const { count: scansToday } = await supabase
      .from("scan_events")
      .select("*", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", todayStartUtc.toISOString());

    return { memberDays, scansToday: scansToday || 0, totalScans: device?.total_scans || 0 };
  } catch (err: any) {
    console.error("getDeviceStats error:", err?.message);
    return fallback;
  }
}

export interface InventoryRow {
  id: string;
  device_id: string;
  product_name: string;
  image_url: string | null;
  purchase_price: number;
  purchased_at: string;
  notes: string | null;
  sold_price: number | null;
  sold_at: string | null;
  source_scan_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listInventory(deviceId: string): Promise<InventoryRow[]> {
  // THROWS on Supabase / transport failure so the route handler can surface a
  // proper 5xx and the client can distinguish "fetch failed" from "user has
  // zero items". Returning [] on error here previously caused the client to
  // silently wipe a user's on-screen inventory whenever Supabase had a hiccup.
  if (!supabase) throw new Error("Supabase client not configured");
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("device_id", deviceId)
    .order("purchased_at", { ascending: false });
  if (error) {
    console.error("Supabase listInventory error:", error.message);
    throw new Error(error.message);
  }
  return (data as unknown as InventoryRow[]) || [];
}

export async function createInventoryItem(
  deviceId: string,
  payload: {
    id: string;
    productName: string;
    imageUrl?: string | null;
    purchasePrice: number;
    purchasedAt?: string;
    notes?: string | null;
    soldPrice?: number | null;
    soldAt?: string | null;
    sourceScanId?: string | null;
  }
): Promise<InventoryRow | null> {
  if (!supabase) return null;
  try {
    const now = new Date().toISOString();
    // Race-safe insert-or-update so we never clobber the original `created_at`
    // on retries / migration replay, even under concurrent in-flight requests
    // for the same id. We try INSERT first (Postgres serializes the unique
    // constraint on `id`); on conflict (23505) we fall through to an UPDATE
    // that omits `created_at`. This avoids the SELECT-then-upsert TOCTOU
    // race where two parallel callers can both observe "doesn't exist" and
    // both write `created_at`.
    const updateFields = {
      device_id: deviceId,
      product_name: payload.productName,
      image_url: payload.imageUrl ?? null,
      purchase_price: payload.purchasePrice,
      purchased_at: payload.purchasedAt ?? now,
      notes: payload.notes ?? null,
      sold_price: payload.soldPrice ?? null,
      sold_at: payload.soldAt ?? null,
      source_scan_id: payload.sourceScanId ?? null,
      updated_at: now,
    };
    const insertFields = { id: payload.id, ...updateFields, created_at: now };

    const { data: inserted, error: insertErr } = await supabase
      .from("inventory_items")
      .insert(insertFields)
      .select()
      .maybeSingle();
    if (!insertErr) {
      return (inserted as unknown as InventoryRow) || null;
    }
    // 23505 = unique_violation → row already exists; update without touching created_at.
    if ((insertErr as any).code !== "23505") {
      console.error("Supabase createInventoryItem insert error:", insertErr.message);
      return null;
    }
    const { data: updated, error: updErr } = await supabase
      .from("inventory_items")
      .update(updateFields)
      .eq("id", payload.id)
      .select()
      .maybeSingle();
    if (updErr) {
      console.error("Supabase createInventoryItem update error:", updErr.message);
      return null;
    }
    return (updated as unknown as InventoryRow) || null;
  } catch (err: any) {
    console.error("createInventoryItem error:", err?.message);
    return null;
  }
}

export async function updateInventoryItemRow(
  deviceId: string,
  itemId: string,
  updates: {
    productName?: string;
    imageUrl?: string | null;
    purchasePrice?: number;
    notes?: string | null;
    soldPrice?: number | null;
    soldAt?: string | null;
  }
): Promise<InventoryRow | null> {
  if (!supabase) return null;
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.productName !== undefined) patch.product_name = updates.productName;
    if (updates.imageUrl !== undefined) patch.image_url = updates.imageUrl;
    if (updates.purchasePrice !== undefined) patch.purchase_price = updates.purchasePrice;
    if (updates.notes !== undefined) patch.notes = updates.notes;
    if (updates.soldPrice !== undefined) patch.sold_price = updates.soldPrice;
    if (updates.soldAt !== undefined) patch.sold_at = updates.soldAt;

    const { data, error } = await supabase
      .from("inventory_items")
      .update(patch)
      .eq("device_id", deviceId)
      .eq("id", itemId)
      .select()
      .maybeSingle();
    if (error) {
      // Distinguish "no row matched" (legitimate 404) from real Supabase
      // errors. With .maybeSingle() a missing row returns data=null without
      // an error, so any error here is a true backend failure — throw so
      // the route handler returns 500 instead of a misleading 404.
      console.error("Supabase updateInventoryItem error:", error.message);
      throw new Error(error.message);
    }
    return (data as unknown as InventoryRow) || null;
  } catch (err: any) {
    console.error("updateInventoryItem error:", err?.message);
    throw err;
  }
}

export async function deleteInventoryItem(deviceId: string, itemId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("device_id", deviceId)
      .eq("id", itemId);
    if (error) {
      console.error("Supabase deleteInventoryItem error:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("deleteInventoryItem error:", err?.message);
    return false;
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
