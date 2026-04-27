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

// --- Scan image retention --------------------------------------------------
// Tracks photos uploaded to the `scan-images` bucket so we can prune them.
// Policy: keep the 10 most recent scans per device, plus any photo whose
// public_url is referenced by an inventory_items.image_url row for the device.
// Anything else gets deleted (storage file + table row).

const RECENT_SCAN_KEEP = 10;

export async function insertScanImage(
  deviceId: string,
  fileName: string,
  publicUrl: string
): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("device_scan_images")
      .insert({
        device_id: deviceId,
        file_name: fileName,
        public_url: publicUrl,
      });
    if (error) {
      console.error("Supabase insertScanImage error:", error.message);
    }
  } catch (err: any) {
    console.error("insertScanImage error:", err?.message);
  }
}

export async function pruneDeviceScanImages(deviceId: string): Promise<void> {
  if (!supabase) return;
  try {
    // 1. All scan-image rows for this device, newest first. Tie-break on `id`
    //    so two inserts with the exact same created_at sort deterministically
    //    (avoids edge-case misclassification under concurrent scans).
    const { data: allRows, error: listErr } = await supabase
      .from("device_scan_images")
      .select("id, file_name, public_url, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (listErr) {
      console.error("Supabase pruneDeviceScanImages list error:", listErr.message);
      return;
    }
    const rows = (allRows || []) as Array<{
      id: string;
      file_name: string;
      public_url: string;
      created_at: string;
    }>;
    if (rows.length <= RECENT_SCAN_KEEP) return;

    // 2. Candidates for removal: anything past the recent-N window.
    const candidates = rows.slice(RECENT_SCAN_KEEP);

    // 3. Pull the device's full set of inventory image_urls and filter in
    //    memory. Doing this in-memory (rather than `.in(image_url, [...])`)
    //    keeps query size bounded by inventory row count instead of
    //    candidate URL string length, which avoids PostgREST URL-size limits
    //    for power users with long histories.
    const { data: invRows, error: invErr } = await supabase
      .from("inventory_items")
      .select("image_url")
      .eq("device_id", deviceId);
    if (invErr) {
      console.error("Supabase pruneDeviceScanImages inv lookup error:", invErr.message);
      return;
    }
    const pinned = new Set<string>(
      ((invRows || []) as Array<{ image_url: string | null }>)
        .map((r) => r.image_url)
        .filter((u): u is string => !!u)
    );

    const toDelete = candidates.filter((r) => !pinned.has(r.public_url));
    if (toDelete.length === 0) return;

    // 4. Delete storage files (best-effort) then table rows.
    const fileNames = toDelete.map((r) => r.file_name);
    const { error: storageErr } = await supabase.storage
      .from("scan-images")
      .remove(fileNames);
    if (storageErr) {
      console.error("Supabase pruneDeviceScanImages storage error:", storageErr.message);
      // Continue to row delete anyway — orphaned storage is preferable to
      // orphaned table rows that would prevent re-pruning.
    }

    const ids = toDelete.map((r) => r.id);
    const { error: rowErr } = await supabase
      .from("device_scan_images")
      .delete()
      .in("id", ids);
    if (rowErr) {
      console.error("Supabase pruneDeviceScanImages row delete error:", rowErr.message);
    } else {
      console.log(`Pruned ${toDelete.length} scan image(s) for device ${deviceId.slice(0, 8)}...`);
    }
  } catch (err: any) {
    console.error("pruneDeviceScanImages error:", err?.message);
  }
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

// Once we discover that the optional `error_reason` column doesn't exist on
// the ebay_search_events table (e.g. on a Supabase project where the
// startup migration couldn't run), stop trying to insert it. This keeps
// analytics from generating two inserts per call forever.
let ebaySearchEventsHasErrorReasonColumn: boolean | null = null;

function ebaySearchEventsBaseRow(
  deviceId: string,
  isPro: boolean,
  searchQuery: string,
  isBroad: boolean,
  resultsCount: number,
  avgSoldPrice: number,
): Record<string, unknown> {
  return {
    device_id: deviceId,
    is_pro: isPro,
    search_query: searchQuery,
    is_broad: isBroad,
    results_count: resultsCount,
    avg_sold_price: avgSoldPrice,
  };
}

export function logEbaySearchEvent(
  deviceId: string,
  isPro: boolean,
  searchQuery: string,
  isBroad: boolean,
  resultsCount: number,
  avgSoldPrice: number,
  errorReason?: string | null
) {
  if (!supabase) return;
  const sb = supabase; // narrow for closures

  try {
    const baseRow = ebaySearchEventsBaseRow(
      deviceId,
      isPro,
      searchQuery,
      isBroad,
      resultsCount,
      avgSoldPrice,
    );
    const truncatedReason = errorReason ? errorReason.slice(0, 500) : null;

    const insertWithoutReason = () =>
      sb.from("ebay_search_events").insert(baseRow).then(({ error }) => {
        if (error) {
          console.error("Supabase ebay_search_events error:", error.message);
        }
      });

    const insertPromise =
      truncatedReason && ebaySearchEventsHasErrorReasonColumn !== false
        ? sb
            .from("ebay_search_events")
            .insert({ ...baseRow, error_reason: truncatedReason })
            .then(({ error }) => {
              if (error) {
                // Postgres "undefined column" is 42703; PostgREST uses code
                // PGRST204 ("column not found in cache") for the same situation.
                const code = (error as { code?: string }).code || "";
                const msg = error.message || "";
                if (
                  code === "42703" ||
                  code === "PGRST204" ||
                  /column\s+"?error_reason"?\s+(?:of|does not exist|not found)/i.test(msg)
                ) {
                  if (ebaySearchEventsHasErrorReasonColumn !== false) {
                    console.log(
                      "ebay_search_events.error_reason column missing — falling back; analytics will skip the field until column is added",
                    );
                  }
                  ebaySearchEventsHasErrorReasonColumn = false;
                  return insertWithoutReason();
                }
                console.error("Supabase ebay_search_events error:", msg);
                return undefined;
              }
              if (ebaySearchEventsHasErrorReasonColumn === null) {
                ebaySearchEventsHasErrorReasonColumn = true;
              }
              return undefined;
            })
        : insertWithoutReason();

    safeLog(insertPromise, "ebay_search_events insert");

    upsertDevice(deviceId, isPro, "ebay");
  } catch (err: any) {
    console.error("Supabase logEbaySearchEvent error:", err?.message);
  }
}

export async function ensureEbaySearchEventsSchema(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log("ensureEbaySearchEventsSchema skipped: SUPABASE_DB_URL not set");
    return;
  }

  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: dbUrl,
      // Cap connection attempt so DNS/network failures fail fast and don't
      // keep boot logs noisy.
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    } as any);
    await client.connect();
    await client.query(
      "ALTER TABLE ebay_search_events ADD COLUMN IF NOT EXISTS error_reason text",
    );
    await client.end();
    ebaySearchEventsHasErrorReasonColumn = true;
    console.log("Supabase ebay_search_events schema ensured (error_reason present)");
  } catch (err: any) {
    // DNS or network unreachable to the direct Supabase DB host is common in
    // some Replit dev containers — the analytics insert path will fall back
    // gracefully, so just warn instead of erroring loudly.
    const msg = err?.message || String(err);
    console.log(
      `ensureEbaySearchEventsSchema skipped (analytics will fall back if needed): ${msg}`,
    );
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
