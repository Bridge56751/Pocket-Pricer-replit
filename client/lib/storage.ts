import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SearchHistoryItem, FavoriteItem, InventoryItem, UserSettings } from "@/types/product";
import { apiRequest } from "@/lib/query-client";

const STORAGE_KEYS = {
  SEARCH_HISTORY: "@ebay_profit/search_history",
  FAVORITES: "@ebay_profit/favorites",
  INVENTORY: "@ebay_profit/inventory",
  INVENTORY_MIGRATED: "@ebay_profit/inventory_migrated_v1",
  USER_SETTINGS: "@ebay_profit/user_settings",
};

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

function sanitizeResults(results: any): any {
  if (!results) return null;
  
  if (results.productInfo && typeof results.productInfo === 'object') {
    results.productInfo = {
      name: typeof results.productInfo.name === 'string' ? results.productInfo.name : 'Product',
      brand: results.productInfo.brand,
      category: results.productInfo.category,
      description: results.productInfo.description,
    };
  }
  
  delete results.scannedImageId;
  delete results.scannedImageUri;
  
  if (results.query && typeof results.query !== 'string') {
    results.query = 'Product';
  }
  
  return results;
}

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.map((item: any) => ({
        ...item,
        query: typeof item.query === 'string' ? item.query : 'Product',
        results: sanitizeResults(item.results),
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export async function addSearchHistory(item: SearchHistoryItem): Promise<void> {
  try {
    const history = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    let parsed: SearchHistoryItem[] = [];
    if (history) {
      try {
        const candidate = JSON.parse(history);
        parsed = Array.isArray(candidate) ? candidate : [];
      } catch {
        parsed = [];
      }
    }
    const newHistory = [item, ...parsed.filter((h: SearchHistoryItem) => h.id !== item.id)].slice(0, 10);
    await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(newHistory));
  } catch (error) {
    console.error("Failed to save search history:", error);
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

export async function updateInventoryItem(
  deviceId: string,
  id: string,
  updates: Partial<InventoryItem>
): Promise<InventoryItem | null> {
  try {
    const body: Record<string, unknown> = {};
    if (updates.productName !== undefined) {
      const cleaned = cleanInventoryName(updates.productName);
      if (!cleaned) {
        console.error("updateInventoryItem: empty productName after cleanup");
        return null;
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
      return null;
    }
    const json = await res.json();
    return json?.item ? rowToItem(json.item) : null;
  } catch (error) {
    console.error("Failed to update inventory item:", error);
    return null;
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
    const local: InventoryItem[] = data ? JSON.parse(data) : [];

    if (local.length === 0) {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.INVENTORY_MIGRATED, "1");
      } catch (e) {
        console.warn("Migration: failed to set completion flag (empty case):", e);
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
