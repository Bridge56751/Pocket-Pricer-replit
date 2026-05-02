import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  SearchHistoryItem,
  FavoriteItem,
  InventoryItem,
  UserSettings,
  Product,
  ListingItem,
  SearchResultsData,
} from "@/types/product";
import { apiRequest } from "@/lib/query-client";

const STORAGE_KEYS = {
  SEARCH_HISTORY: "@ebay_profit/search_history",
  FAVORITES: "@ebay_profit/favorites",
  INVENTORY: "@ebay_profit/inventory",
  INVENTORY_MIGRATED: "@ebay_profit/inventory_migrated_v1",
  USER_SETTINGS: "@ebay_profit/user_settings",
  INVENTORY_CACHE_PREFIX: "@ebay_profit/inventory_cache_v1:",
};

function inventoryCacheKey(deviceId: string): string {
  return `${STORAGE_KEYS.INVENTORY_CACHE_PREFIX}${deviceId}`;
}

export async function getCachedInventory(deviceId: string): Promise<InventoryItem[] | null> {
  if (!deviceId) return null;
  try {
    const raw = await AsyncStorage.getItem(inventoryCacheKey(deviceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as InventoryItem[];
  } catch {
    return null;
  }
}

export function setCachedInventory(deviceId: string, items: InventoryItem[]): void {
  if (!deviceId) return;
  AsyncStorage.setItem(inventoryCacheKey(deviceId), JSON.stringify(items)).catch((err) => {
    console.warn("Failed to cache inventory:", err);
  });
}

interface InventoryRowResponse {
  id: string;
  device_id: string;
  product_name: string;
  image_url: string | null;
  purchase_price: number | string;
  purchased_at: string;
  notes: string | null;
  sold_price: number | string | null;
  sold_at: string | null;
  source_scan_id: string | null;
}

function rowToItem(row: InventoryRowResponse): InventoryItem {
  return {
    id: row.id,
    productName: row.product_name,
    imageUrl: row.image_url ?? undefined,
    purchasePrice: typeof row.purchase_price === "string" ? parseFloat(row.purchase_price) : row.purchase_price,
    purchasedAt: row.purchased_at,
    notes: row.notes ?? undefined,
    soldPrice:
      row.sold_price === null || row.sold_price === undefined
        ? undefined
        : typeof row.sold_price === "string"
        ? parseFloat(row.sold_price)
        : row.sold_price,
    soldAt: row.sold_at ?? undefined,
    sourceProductId: row.source_scan_id ?? undefined,
  };
}

export const INVENTORY_NAME_MAX_LENGTH = 50;

export function parsePurchasePrice(input: string | null | undefined): number | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function cleanInventoryName(
  input: string | undefined | null,
  maxLength: number = INVENTORY_NAME_MAX_LENGTH
): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(
    /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
    ""
  );
  try {
    s = s.replace(/\p{Extended_Pictographic}/gu, "");
  } catch {
    // older JS engines without Unicode property escapes; skip emoji strip
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLength) {
    const cut = s.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(" ");
    const trimmed = lastSpace > maxLength - 15 ? cut.slice(0, lastSpace) : cut;
    s = trimmed.trimEnd() + "…";
  }
  return s;
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultCost: 0,
  defaultShippingCost: 5,
  targetProfitMargin: 30,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitizeResults(results: unknown): SearchResultsData | undefined {
  if (!isRecord(results)) return undefined;
  const sanitized: Record<string, unknown> = { ...results };
  delete sanitized.scannedImageId;
  delete sanitized.scannedImageUri;
  if (typeof sanitized.query !== "string") {
    sanitized.query = "Product";
  }
  if (isRecord(sanitized.productInfo)) {
    const pi = sanitized.productInfo;
    sanitized.productInfo = {
      name: typeof pi.name === "string" ? pi.name : "Product",
      brand: typeof pi.brand === "string" ? pi.brand : undefined,
      category: typeof pi.category === "string" ? pi.category : undefined,
      description: typeof pi.description === "string" ? pi.description : undefined,
    };
  }
  return sanitized as unknown as SearchResultsData;
}

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    if (!data) return [];
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((item) => ({
      ...(item as unknown as SearchHistoryItem),
      query: typeof item.query === "string" ? item.query : "Product",
      results: sanitizeResults(item.results),
    }));
  } catch {
    return [];
  }
}

const HISTORY_LISTING_CAP = 12;
const HISTORY_MAX_ITEMS = 10;

function slimListing(listing: Product | ListingItem | null | undefined): Product | null {
  if (!listing) return null;
  return {
    id: listing.id,
    title: listing.title,
    imageUrl: listing.imageUrl,
    currentPrice: listing.currentPrice,
    originalPrice: listing.originalPrice,
    condition: listing.condition,
    shipping: listing.shipping,
    link: listing.link,
    seller: listing.seller,
  };
}

function slimResultsForHistory(
  results: SearchResultsData | undefined,
): SearchResultsData | undefined {
  if (!results) return undefined;
  const listings = Array.isArray(results.listings)
    ? (results.listings.slice(0, HISTORY_LISTING_CAP).map((l) => ({
        id: l.id,
        title: l.title,
        imageUrl: l.imageUrl,
        currentPrice: l.currentPrice,
        originalPrice: l.originalPrice,
        condition: l.condition,
        shipping: l.shipping,
        link: l.link,
        seller: l.seller,
        platform: l.platform,
      })) as ListingItem[])
    : [];
  return {
    query: typeof results.query === "string" ? results.query : "Product",
    totalListings: results.totalListings,
    avgListPrice: results.avgListPrice,
    avgSalePrice: results.avgSalePrice,
    soldCount: results.soldCount,
    bestBuyNow: results.bestBuyNow,
    topSalePrice: results.topSalePrice,
    listings,
    scannedImageUrl:
      typeof results.scannedImageUrl === "string" ? results.scannedImageUrl : null,
    usedLens: results.usedLens,
    productInfo: results.productInfo,
  };
}

export async function addSearchHistory(item: SearchHistoryItem): Promise<void> {
  let parsed: SearchHistoryItem[] = [];
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    if (raw) {
      const candidate = JSON.parse(raw);
      parsed = Array.isArray(candidate) ? candidate : [];
    }
  } catch {
    parsed = [];
  }

  const slim: SearchHistoryItem = {
    id: item.id,
    query: typeof item.query === "string" ? item.query : "Product",
    product: slimListing(item.product),
    searchedAt: item.searchedAt,
    thumbnailUrl: item.thumbnailUrl,
    avgPrice: item.avgPrice,
    bestPrice: item.bestPrice,
    totalListings: item.totalListings,
    results: slimResultsForHistory(item.results),
  };

  const newHistory = [
    slim,
    ...parsed.filter((h) => h.id !== slim.id),
  ].slice(0, HISTORY_MAX_ITEMS);

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(newHistory));
  } catch (error) {
    console.error("Failed to save search history:", error);
    throw error;
  }
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
  } catch (error) {
    console.error("Failed to clear search history:", error);
  }
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addFavorite(item: FavoriteItem): Promise<void> {
  try {
    const favorites = await getFavorites();
    const newFavorites = [item, ...favorites.filter(f => f.id !== item.id)];
    await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
  } catch (error) {
    console.error("Failed to save favorite:", error);
  }
}

export async function removeFavorite(id: string): Promise<void> {
  try {
    const favorites = await getFavorites();
    const newFavorites = favorites.filter(f => f.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
  } catch (error) {
    console.error("Failed to remove favorite:", error);
  }
}

export async function clearFavorites(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.FAVORITES);
  } catch (error) {
    console.error("Failed to clear favorites:", error);
  }
}

export async function isFavorite(productId: string): Promise<boolean> {
  try {
    const favorites = await getFavorites();
    return favorites.some(f => f.product.id === productId);
  } catch {
    return false;
  }
}

export async function getInventory(deviceId: string): Promise<InventoryItem[]> {
  // Throws on network/HTTP failure so callers can distinguish "fetch failed"
  // from "inventory is genuinely empty" and avoid wiping the on-screen list
  // when a refresh fails. Callers should catch and keep their existing state.
  let res: Response;
  try {
    res = await apiRequest("GET", `/api/inventory/${encodeURIComponent(deviceId)}`);
  } catch (error) {
    console.error("Failed to load inventory:", error);
    throw error;
  }
  if (!res.ok) {
    console.error("getInventory http error", res.status);
    throw new Error(`getInventory failed with status ${res.status}`);
  }
  const json = await res.json();
  const rows: InventoryRowResponse[] = json?.items || [];
  return rows.map(rowToItem);
}

export async function addInventoryItem(deviceId: string, item: InventoryItem): Promise<InventoryItem | null> {
  const cleanedName = cleanInventoryName(item.productName);
  if (!cleanedName) {
    console.error("addInventoryItem: empty productName after cleanup");
    return null;
  }
  // Cancel the in-flight fetch on timeout (best-effort at the transport
  // layer; the server may still receive/process the request). Server-side
  // createInventoryItem upserts by id, so any retry from the user reuses
  // the same item.id and won't create a duplicate. The next inventory
  // refresh reconciles local state with whatever the server actually has.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error("addInventoryItem timeout after 15s, aborting");
    controller.abort();
  }, 15000);
  try {
    const res = await apiRequest(
      "POST",
      `/api/inventory/${encodeURIComponent(deviceId)}`,
      {
        id: item.id,
        productName: cleanedName,
        imageUrl: item.imageUrl ?? null,
        purchasePrice: item.purchasePrice,
        purchasedAt: item.purchasedAt,
        notes: item.notes ?? null,
        soldPrice: item.soldPrice ?? null,
        soldAt: item.soldAt ?? null,
        sourceScanId: item.sourceProductId ?? null,
      },
      undefined,
      controller.signal,
    );
    clearTimeout(timeoutId);
    if (!res.ok) {
      console.error("addInventoryItem http error", res.status);
      return null;
    }
    const json = await res.json();
    return json?.item ? rowToItem(json.item) : null;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Failed to add inventory item:", error);
    return null;
  }
}

// Discriminated result so callers can distinguish "item no longer exists on
// the server" (HTTP 404) from a real failure. The mark-sold / edit-name
// flows use this to suppress the misleading "Couldn't save" alert when the
// item was already deleted (e.g. user mark-sold and delete back-to-back) —
// the next reconcile will quietly drop it from the UI.
export type UpdateInventoryResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; notFound: boolean };

export async function updateInventoryItem(
  deviceId: string,
  id: string,
  updates: Partial<InventoryItem>
): Promise<UpdateInventoryResult> {
  try {
    const body: Record<string, unknown> = {};
    if (updates.productName !== undefined) {
      const cleaned = cleanInventoryName(updates.productName);
      if (!cleaned) {
        console.error("updateInventoryItem: empty productName after cleanup");
        return { ok: false, notFound: false };
      }
      body.productName = cleaned;
    }
    if (updates.imageUrl !== undefined) body.imageUrl = updates.imageUrl ?? null;
    if (updates.purchasePrice !== undefined) body.purchasePrice = updates.purchasePrice;
    if (updates.notes !== undefined) body.notes = updates.notes ?? null;
    if (updates.soldPrice !== undefined) body.soldPrice = updates.soldPrice ?? null;
    if (updates.soldAt !== undefined) body.soldAt = updates.soldAt ?? null;

    // Cancel the in-flight fetch on timeout (best-effort; the server may
    // still process the request). Updates are keyed by item id, so any
    // client retry targets the same row (idempotent) and the next
    // inventory refresh reconciles local state with the server.
    const controller = new AbortController();
    const updateTimeoutHandle = setTimeout(() => {
      console.error("updateInventoryItem timeout after 10s, aborting");
      controller.abort();
    }, 10000);
    let res: Response;
    try {
      res = await apiRequest(
        "PATCH",
        `/api/inventory/${encodeURIComponent(deviceId)}/${encodeURIComponent(id)}`,
        body,
        undefined,
        controller.signal,
      );
    } finally {
      clearTimeout(updateTimeoutHandle);
    }
    if (!res.ok) {
      console.error("updateInventoryItem http error", res.status);
      return { ok: false, notFound: res.status === 404 };
    }
    const json = await res.json();
    if (!json?.item) return { ok: false, notFound: false };
    return { ok: true, item: rowToItem(json.item) };
  } catch (error) {
    console.error("Failed to update inventory item:", error);
    return { ok: false, notFound: false };
  }
}

export async function removeInventoryItem(deviceId: string, id: string): Promise<boolean> {
  try {
    // Cancel the in-flight fetch on timeout (best-effort; the server may
    // still process the request). Deletes are keyed by item id and naturally
    // idempotent; any retry targets the same row, and the next inventory
    // refresh reconciles local state with the server.
    const controller = new AbortController();
    const removeTimeoutHandle = setTimeout(() => {
      console.error("removeInventoryItem timeout after 10s, aborting");
      controller.abort();
    }, 10000);
    let res: Response;
    try {
      res = await apiRequest(
        "DELETE",
        `/api/inventory/${encodeURIComponent(deviceId)}/${encodeURIComponent(id)}`,
        undefined,
        undefined,
        controller.signal,
      );
    } finally {
      clearTimeout(removeTimeoutHandle);
    }
    return res.ok;
  } catch (error) {
    console.error("Failed to remove inventory item:", error);
    return false;
  }
}

// Internal helper used by the migration only. Differentiates between:
//   - "ok"     : upload succeeded OR the row already exists on the server
//                (HTTP 2xx, or 409 conflict — both mean "it's there now").
//   - "drop"   : server permanently rejected the item (HTTP 4xx, e.g. validation).
//                Retrying will never succeed, so we drop it from the local cache
//                instead of looping on it every launch.
//   - "retry"  : transient failure (network error, 5xx). Keep locally and retry.
async function uploadItemForMigration(
  deviceId: string,
  item: InventoryItem
): Promise<"ok" | "drop" | "retry"> {
  try {
    const res = await apiRequest("POST", `/api/inventory/${encodeURIComponent(deviceId)}`, {
      id: item.id,
      productName: item.productName,
      imageUrl: item.imageUrl ?? null,
      purchasePrice: item.purchasePrice,
      purchasedAt: item.purchasedAt,
      notes: item.notes ?? null,
      soldPrice: item.soldPrice ?? null,
      soldAt: item.soldAt ?? null,
      sourceScanId: item.sourceProductId ?? null,
    });
    if (res.ok) return "ok";
    if (res.status === 409) return "ok";
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      console.warn("Migration: dropping item rejected by server", item.id, res.status);
      return "drop";
    }
    return "retry";
  } catch (error) {
    console.error("Migration: network error uploading item", item.id, error);
    return "retry";
  }
}

let _migrationInFlight = false;

export async function migrateLocalInventoryToCloud(deviceId: string): Promise<void> {
  if (_migrationInFlight) return;
  _migrationInFlight = true;
  try {
    const flag = await AsyncStorage.getItem(STORAGE_KEYS.INVENTORY_MIGRATED);
    if (flag === "1") return;

    const data = await AsyncStorage.getItem(STORAGE_KEYS.INVENTORY);
    // Defensively parse the local cache. If it's corrupt (malformed JSON or
    // not an array), treat it as empty rather than throwing — otherwise the
    // migration would fail every launch forever and never set the completion
    // flag, looping on every cold start.
    let local: InventoryItem[] = [];
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          local = parsed as InventoryItem[];
        } else {
          console.warn("Migration: local inventory cache is not an array; treating as empty");
        }
      } catch (e) {
        console.warn("Migration: local inventory cache is corrupt; treating as empty", e);
      }
    }

    if (local.length === 0) {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORY_MIGRATED, "1");
      } catch (e) {
        console.warn("Migration: failed to set completion flag (empty case):", e);
      }
      // Also clear the underlying key so a corrupt-but-non-null blob (or any
      // legacy data) does not linger in AsyncStorage forever. If the key was
      // already absent this is a harmless no-op.
      try {
        await AsyncStorage.removeItem(STORAGE_KEYS.INVENTORY);
      } catch (e) {
        console.warn("Migration: failed to clear local cache (empty case):", e);
      }
      return;
    }

    let anyRetry = false;
    const remaining: InventoryItem[] = [];
    for (const item of local) {
      const result = await uploadItemForMigration(deviceId, item);
      if (result === "retry") {
        anyRetry = true;
        remaining.push(item);
      }
      // "ok" and "drop" both mean: do not keep this item in local storage.
    }

    if (!anyRetry) {
      // Everything either succeeded or was permanently rejected. Done forever.
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORY_MIGRATED, "1");
      } catch (e) {
        console.warn("Migration: failed to set completion flag:", e);
      }
      try {
        await AsyncStorage.removeItem(STORAGE_KEYS.INVENTORY);
      } catch (e) {
        console.warn("Migration: failed to clear local cache:", e);
      }
    } else {
      // Persist only the unmigrated items for next launch's retry.
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(remaining));
      } catch (e) {
        console.warn("Migration: failed to write remaining items:", e);
      }
    }
  } catch (error) {
    console.error("Inventory migration failed:", error);
  } finally {
    _migrationInFlight = false;
  }
}

export async function getUserSettings(): Promise<UserSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  try {
    const current = await getUserSettings();
    const newSettings = { ...current, ...settings };
    await AsyncStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(newSettings));
  } catch (error) {
    console.error("Failed to save user settings:", error);
  }
}
