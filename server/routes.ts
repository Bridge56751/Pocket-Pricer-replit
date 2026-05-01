import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getGuestScanCount, incrementGuestScan } from "./db";
import {
  logScanEvent,
  logEbaySearchEvent,
  supabase,
  initScanImagesBucket,
  getDeviceStats,
  listInventory,
  createInventoryItem,
  updateInventoryItemRow,
  deleteInventoryItem,
  insertScanImage,
  pruneDeviceScanImages,
} from "./supabase";
import { cleanQueryWithAI } from "./gemini";
import { checkProviderBudget } from "./provider-budget";

const FREE_LIFETIME_SEARCHES = 3;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// Inventory ops are bursty (e.g., bulk-adding multiple flips with a refresh
// after each save). Give them their own, more generous limit so a power
// reseller can't get throttled by their own scan activity.
const INVENTORY_RATE_LIMIT_MAX = 60;

const rateLimitMap = new Map<string, number[]>();
const inventoryRateLimitMap = new Map<string, number[]>();

function checkRateLimit(
  map: Map<string, number[]>,
  deviceId: string,
  max: number,
): boolean {
  const now = Date.now();
  const timestamps = map.get(deviceId) || [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= max) {
    map.set(deviceId, recent);
    return true;
  }
  recent.push(now);
  map.set(deviceId, recent);
  return false;
}

function isRateLimited(deviceId: string): boolean {
  return checkRateLimit(rateLimitMap, deviceId, RATE_LIMIT_MAX);
}

function isInventoryRateLimited(deviceId: string): boolean {
  return checkRateLimit(
    inventoryRateLimitMap,
    deviceId,
    INVENTORY_RATE_LIMIT_MAX,
  );
}

setInterval(
  () => {
    const now = Date.now();
    for (const map of [rateLimitMap, inventoryRateLimitMap]) {
      for (const [key, timestamps] of map) {
        const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
        if (recent.length === 0) {
          map.delete(key);
        } else {
          map.set(key, recent);
        }
      }
    }
  },
  5 * 60 * 1000,
);

async function deleteSupabaseImage(fileName: string): Promise<void> {
  if (!supabase || !fileName) return;
  try {
    await supabase.storage.from("scan-images").remove([fileName]);
  } catch (err: any) {
    console.error("Failed to delete scan image:", err?.message);
  }
}

async function uploadImageForLens(
  imageBase64: string,
): Promise<{ url: string; supabaseFileName: string | null } | null> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const uploadServices: (() => Promise<{
    url: string;
    supabaseFileName: string | null;
  } | null>)[] = [
    async () => {
      if (!supabase) return null;
      const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const imageBuffer = Buffer.from(cleanBase64, "base64");
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${ext}`;
      const { error } = await supabase.storage
        .from("scan-images")
        .upload(fileName, imageBuffer, {
          contentType: mimeType,
          upsert: false,
        });
      if (error) {
        console.error("Supabase storage upload error:", error.message);
        return null;
      }
      const { data } = supabase.storage
        .from("scan-images")
        .getPublicUrl(fileName);
      if (!data?.publicUrl) return null;
      return { url: data.publicUrl, supabaseFileName: fileName };
    },
    async () => {
      if (!process.env.FREEIMAGE_API_KEY) return null;
      const formData = new URLSearchParams();
      formData.append("key", process.env.FREEIMAGE_API_KEY);
      formData.append("source", cleanBase64);
      formData.append("format", "json");
      const response = await fetch("https://freeimage.host/api/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (data.status_code === 200 && data.image?.url)
        return { url: data.image.url, supabaseFileName: null };
      return null;
    },
    async () => {
      if (!process.env.IMGBB_API_KEY) return null;
      const formData = new URLSearchParams();
      formData.append("key", process.env.IMGBB_API_KEY);
      formData.append("image", cleanBase64);
      const response = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (data.success && data.data?.url)
        return { url: data.data.url, supabaseFileName: null };
      return null;
    },
  ];

  for (const service of uploadServices) {
    try {
      const result = await service();
      if (result) return result;
    } catch (error) {
      console.error("Image upload service failed, trying next:", error);
    }
  }

  console.error("All image upload services failed");
  return null;
}

interface GoogleLensProduct {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  price?: {
    value?: number;
    extracted_value?: number;
    currency?: string;
  };
  thumbnail?: string;
  rating?: number;
  reviews?: number;
}

interface SearchApiLensResponse {
  visual_matches?: {
    position?: number;
    title?: string;
    link?: string;
    source?: string;
    price?: string;
    extracted_price?: number;
    currency?: string;
    thumbnail?: string;
    rating?: number;
    reviews?: number;
  }[];
  knowledge_graph?: {
    title?: string;
    description?: string;
  }[];
  search_metadata?: {
    status?: string;
  };
  error?: string;
}

interface ScrapingDogLensItem {
  position?: number;
  title?: string;
  link?: string;
  source?: string;
  source_favicon?: string;
  price?: string;
  extracted_price?: number;
  currency?: string;
  thumbnail?: string;
  rating?: number;
  reviews?: number;
}

interface ScrapingDogLensResponse {
  lens_results?: ScrapingDogLensItem[];
  visual_matches?: ScrapingDogLensItem[];
  product_results?: ScrapingDogLensItem[];
  knowledge_graph?: {
    title?: string;
    description?: string;
  }[];
  search_information?: {
    status?: string;
  };
  error?: string;
}

type LensResult = {
  products: GoogleLensProduct[];
  productName?: string;
  provider: string;
  error?: string;
  pricedCount?: number;
};

function parsePrice(priceStr?: string): { value?: number; currency?: string } {
  if (!priceStr) return {};
  const match = priceStr.match(/([£€$]?)\s*([\d,]+\.?\d*)/);
  if (!match) return {};
  const currencyMap: Record<string, string> = {
    $: "USD",
    "£": "GBP",
    "€": "EUR",
  };
  return {
    value: parseFloat(match[2].replace(/,/g, "")),
    currency: currencyMap[match[1]] || "USD",
  };
}

async function searchWithScrapingDog(
  imageUrl: string,
  customerKey: string,
  isPro: boolean,
): Promise<LensResult> {
  const apiKey = process.env.SCRAPINGDOG_API_KEY;
  if (!apiKey) {
    return {
      products: [],
      provider: "scrapingdog",
      error: "ScrapingDog key not configured",
    };
  }

  // P0-8: per-Pro-customer monthly budget cap.
  const budgetOk = await checkProviderBudget("scrapingdog", customerKey, isPro);
  if (!budgetOk) {
    return {
      products: [],
      provider: "scrapingdog",
      error: "budget_cap_scrapingdog",
    };
  }

  try {
    const startTime = Date.now();
    const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(imageUrl)}`;
    const params = new URLSearchParams({
      api_key: apiKey,
      url: lensUrl,
      country: "us",
      language: "en",
      visual_matches: "true",
      product_results: "true",
    });

    const response = await fetch(
      `https://api.scrapingdog.com/google_lens?${params.toString()}`,
      {
        signal: AbortSignal.timeout(12000),
      },
    );
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      console.error(`[ScrapingDog] HTTP ${response.status} (${elapsed}ms)`);
      return {
        products: [],
        provider: "scrapingdog",
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as ScrapingDogLensResponse;

    if (data.error) {
      console.error(`[ScrapingDog] Error (${elapsed}ms):`, data.error);
      return { products: [], provider: "scrapingdog", error: data.error };
    }

    const lensItems = data.lens_results || [];
    const visualItems = data.visual_matches || [];
    const productItems = data.product_results || [];
    const seen = new Set<string>();
    const allItems: ScrapingDogLensItem[] = [];
    for (const item of [...productItems, ...visualItems, ...lensItems]) {
      const key = item.link || item.title || "";
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      allItems.push(item);
    }

    console.log(
      `[ScrapingDog] Raw: ${lensItems.length} lens_results, ${visualItems.length} visual_matches, ${productItems.length} product_results → ${allItems.length} unique (${elapsed}ms)`,
    );

    const products: GoogleLensProduct[] = allItems.map((item, index) => {
      const extractedPrice = item.extracted_price;
      const parsed = !extractedPrice ? parsePrice(item.price) : {};
      const priceValue = extractedPrice ?? parsed.value;
      const currency = item.currency ?? parsed.currency ?? "USD";

      return {
        position: item.position ?? index + 1,
        title: item.title,
        link: item.link,
        source: item.source,
        price: {
          value: priceValue,
          extracted_value: priceValue,
          currency,
        },
        thumbnail: item.thumbnail,
        rating: item.rating,
        reviews: item.reviews,
      };
    });

    const productName = data.knowledge_graph?.[0]?.title;
    const pricedCount = products.filter(
      (p) => p.price?.value && p.price.value > 0,
    ).length;

    console.log(
      `[ScrapingDog] ${products.length} products, ${pricedCount} with prices (${elapsed}ms)`,
    );
    return { products, productName, provider: "scrapingdog", pricedCount };
  } catch (error) {
    console.error("[ScrapingDog] Request failed:", error);
    return {
      products: [],
      provider: "scrapingdog",
      error: "ScrapingDog request failed",
    };
  }
}

async function searchWithSearchApi(
  imageUrl: string,
  customerKey: string,
  isPro: boolean,
): Promise<LensResult> {
  const apiKey = process.env.SEARCHAPI_API_KEY;
  if (!apiKey) {
    return {
      products: [],
      provider: "searchapi",
      error: "SearchAPI key not configured",
    };
  }

  // P0-8: per-Pro-customer monthly budget cap.
  const budgetOk = await checkProviderBudget("searchapi", customerKey, isPro);
  if (!budgetOk) {
    return {
      products: [],
      provider: "searchapi",
      error: "budget_cap_searchapi",
    };
  }

  try {
    const startTime = Date.now();
    const params = new URLSearchParams({
      engine: "google_lens",
      url: imageUrl,
      hl: "en",
      country: "us",
      api_key: apiKey,
    });

    const response = await fetch(
      `https://www.searchapi.io/api/v1/search?${params.toString()}`,
      {
        signal: AbortSignal.timeout(35000),
      },
    );
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      console.error(`[SearchAPI] HTTP ${response.status} (${elapsed}ms)`);
      return {
        products: [],
        provider: "searchapi",
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as SearchApiLensResponse;

    if (data.error) {
      console.error(`[SearchAPI] Error (${elapsed}ms):`, data.error);
      return { products: [], provider: "searchapi", error: data.error };
    }

    const products: GoogleLensProduct[] = (data.visual_matches || []).map(
      (item) => ({
        position: item.position,
        title: item.title,
        link: item.link,
        source: item.source,
        price: {
          value: item.extracted_price,
          extracted_value: item.extracted_price,
          currency: item.currency,
        },
        thumbnail: item.thumbnail,
        rating: item.rating,
        reviews: item.reviews,
      }),
    );

    const productName = data.knowledge_graph?.[0]?.title;

    console.log(
      `[SearchAPI] Found ${products.length} visual matches in ${elapsed}ms`,
    );
    return { products, productName, provider: "searchapi" };
  } catch (error) {
    console.error("[SearchAPI] Request failed:", error);
    return {
      products: [],
      provider: "searchapi",
      error: "SearchAPI request failed",
    };
  }
}

async function searchWithGoogleLens(
  imageUrl: string,
  customerKey: string,
  isPro: boolean,
): Promise<{
  products: GoogleLensProduct[];
  productName?: string;
  error?: string;
}> {
  try {
    const saResult = await searchWithSearchApi(imageUrl, customerKey, isPro);
    if (!saResult.error && saResult.products.length > 0) {
      console.log(
        `[Lens] Using SearchAPI result (${saResult.products.length} products)`,
      );
      return { products: saResult.products, productName: saResult.productName };
    }

    console.log(
      `[Lens] SearchAPI ${saResult.error ? "failed: " + saResult.error : "returned 0 products"}, falling back to ScrapingDog`,
    );

    const sdResult = await searchWithScrapingDog(imageUrl, customerKey, isPro);
    if (!sdResult.error && sdResult.products.length > 0) {
      console.log(
        `[Lens] Using ScrapingDog fallback (${sdResult.products.length} products)`,
      );
      return { products: sdResult.products, productName: sdResult.productName };
    }

    const errorMsg = sdResult.error || saResult.error || "No products found";
    console.error(
      `[Lens] Both providers failed. SA: ${saResult.error || "0 products"}, SD: ${sdResult.error || "0 products"}`,
    );
    return { products: [], error: errorMsg };
  } catch (error) {
    console.error("[Lens] Unexpected error:", error);
    return { products: [], error: "Search failed" };
  }
}

function calculateMedian(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- eBay sold-search helpers ---------------------------------------------
// Used by /api/ebay-sold-search for retry/auto-broaden cascade.

const EBAY_PRODUCT_CATEGORIES = new Set([
  "sunglasses",
  "glasses",
  "eyeglasses",
  "goggles",
  "shoes",
  "shoe",
  "sneakers",
  "sneaker",
  "boots",
  "boot",
  "sandals",
  "sandal",
  "slippers",
  "loafers",
  "heels",
  "clogs",
  "mules",
  "cleats",
  "jacket",
  "hoodie",
  "sweater",
  "sweatshirt",
  "shirt",
  "blouse",
  "cardigan",
  "blazer",
  "vest",
  "coat",
  "parka",
  "windbreaker",
  "poncho",
  "pants",
  "jeans",
  "shorts",
  "skirt",
  "leggings",
  "joggers",
  "trousers",
  "dress",
  "romper",
  "jumpsuit",
  "overalls",
  "watch",
  "watches",
  "bag",
  "handbag",
  "purse",
  "backpack",
  "wallet",
  "belt",
  "scarf",
  "gloves",
  "hat",
  "cap",
  "beanie",
  "visor",
  "headband",
  "tie",
  "bracelet",
  "necklace",
  "ring",
  "earrings",
  "plush",
  "figure",
  "figurine",
  "doll",
  "toy",
  "funko",
  "lego",
  "controller",
  "mouse",
  "keyboard",
  "headphones",
  "earbuds",
  "speaker",
  "monitor",
  "console",
  "camera",
  "printer",
  "router",
  "tablet",
  "phone",
  "sign",
  "lamp",
  "light",
  "clock",
  "mirror",
  "vase",
  "frame",
  "rug",
  "pillow",
  "blanket",
  "towel",
  "candle",
  "racket",
  "bat",
  "glove",
  "helmet",
  "pads",
  "jersey",
  "stroller",
  "carseat",
  "carrier",
  "toolbox",
  "cooler",
  "thermos",
  "bottle",
  "mug",
  "cup",
  "pan",
  "skillet",
  "knife",
  "shake",
  "protein",
  "supplement",
  "vitamins",
  "powder",
  "bars",
  "vacuum",
  "iron",
  "blender",
  "mixer",
  "toaster",
  "microwave",
  "grill",
]);

function capWordsWithCategory(words: string[], cap: number): string[] {
  if (words.length <= cap) return words;
  const categoryIdx = words.findIndex((w) =>
    EBAY_PRODUCT_CATEGORIES.has(w.toLowerCase()),
  );
  if (categoryIdx >= cap) {
    const capped = words.slice(0, cap - 1);
    capped.push(words[categoryIdx]);
    return capped;
  }
  return words.slice(0, cap);
}

function regexCleanQuery(searchQuery: string): string {
  return (searchQuery.split(/[|·•–—]/)[0] ?? searchQuery)
    .replace(/free shipping.*/i, "")
    .replace(/\(.*?\)/g, "")
    .replace(/@\w+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b(Size|Sz)\s*\d+[\w.]*/gi, "")
    .replace(/\s*-\s*[\w\s]*\/[\w\s/]*$/i, "")
    .replace(
      /\s*-\s*(?:Peacoat|Navy|Gold|Silver|Ivory|Coral|Teal|Maroon|Burgundy|Olive|Charcoal|Beige|Tan|Cream)[\w\s/]*$/i,
      "",
    )
    .replace(
      /\b(Adjustable|Premium|Official|Authentic|Genuine|Brand New|NWT|NWOT|NWB|NIB|NWOB|BNIB|BNWT|BNWOT|MIB|Exclusive)\b/gi,
      "",
    )
    .replace(/\b(RARE|HTF|MINT|EUC|GUC|VGC|OBO)\b/gi, "")
    .replace(/\b(Fit|Style|Collection|Pack|Bundle|Lot)\b/gi, "")
    .replace(
      /\b(Ultra-Lightweight|Lightweight|Ultra-Light|Super Light|Ergonomic|High-Performance|High Performance|Advanced|Professional|Next-Gen|Next Gen)\b/gi,
      "",
    )
    .replace(/\b(with|and|for|the|in|of|by|to|on|at|from|into)\b/gi, "")
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:CPI|DPI|Hz|MHz|GHz|mm|cm|oz|fl|Fl|ML|ml|mg|g|GB|TB|MB|mAh|W|HP|RPM|PSI|FPS|MP|inch|inches|ft|lb|lbs|kg|ct|pk|pc)\b/gi,
      "",
    )
    .replace(/\b\d+(?:\.\d+)?(?:g|oz)\b/gi, "")
    .replace(/\b\d+\s*(?:inch|inches|ft|cm|mm|oz|fl|ml|lb|lbs|kg)\b/gi, "")
    .replace(/\b(Sipbox|Boxed)\b/gi, "")
    .replace(
      /\b(Walmart|Amazon|Target|Nordstrom|Mercari|Poshmark|eBay|Costco|Sam's|Kohls|Macy's|JCPenney|Marshalls|TJ\s*Maxx|HomeGoods|Ross)\b/gi,
      "",
    )
    .replace(/\b(New|Tags|Size|Sz|Step)\b/gi, "")
    .replace(/\b(Jumbo)\b/gi, "")
    .replace(/[\/,&]+/g, " ")
    .replace(/-+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function applyBroadFilters(words: string[]): string[] {
  return words
    .filter((w) => !/^\d+(\.\d+)?$/.test(w))
    .filter(
      (w) =>
        !/^(Men's|Women's|Mens|Womens|Men|Women|Unisex|Boy's|Girl's|Kids|Youth|Adult|Adults|Toddler|Baby|Infant)$/i.test(
          w,
        ),
    )
    .filter(
      (w) =>
        !/^(Black|White|Red|Blue|Green|Navy|Gold|Silver|Gray|Grey|Pink|Purple|Orange|Brown|Beige|Tan|Cream|Ivory|Coral|Teal|Maroon|Burgundy|Olive|Charcoal|Yellow|Camo|Matte|Powder)$/i.test(
          w,
        ),
    )
    .filter(
      (w) =>
        !/^(Large|Small|Medium|XL|XXL|XS|XXXL|Long|Short|Tall|Full|Half|Mini|Micro|Mega|Giant|Big|Tiny|Jumbo)$/i.test(
          w,
        ),
    )
    .filter(
      (w) =>
        !/^(Wireless|Wired|Optical|Mechanical|Programmable|Buttons?|Sensor|Lighting|RGB|LED)$/i.test(
          w,
        ),
    )
    .filter(
      (w) =>
        !/^(Nutrition|Plan|Power|Elite|Core|Basic|Classic|Original|Standard|Limited|Edition|Special|Deluxe)$/i.test(
          w,
        ),
    )
    .filter((w) => !/^(Glossy|Shiny|Clear|Frosted|Tinted)$/i.test(w));
}

export function buildEbaySearchQuery(
  rawQuery: string,
  broadSearch: boolean,
  aiCleaned: string | null,
): string {
  // AI-cleaned strict path: trust the AI output, just enforce the 8-word safety cap.
  if (!broadSearch && aiCleaned) {
    let words = aiCleaned
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 0);
    words = capWordsWithCategory(words, 8);
    return words.join(" ").slice(0, 80) || rawQuery.trim().slice(0, 80);
  }

  // Regex path (fallback when AI skipped/failed, OR for broad searches).
  let words = regexCleanQuery(rawQuery)
    .split(" ")
    .filter((w) => w.length > 0);
  if (broadSearch) {
    words = applyBroadFilters(words);
    words = capWordsWithCategory(words, 5);
  } else {
    words = capWordsWithCategory(words, 8);
  }
  return words.join(" ").slice(0, 80) || rawQuery.trim().slice(0, 80);
}

interface EbayApiResult {
  position?: number;
  item_id?: string;
  title?: string;
  price?: string;
  extracted_price?: number;
  condition?: string;
  shipping?: string;
  extracted_shipping?: number;
  link?: string;
  thumbnail?: string;
  sold_date?: string;
  extracted_sold_date?: string;
}

interface EbayApiData {
  organic_results?: EbayApiResult[];
  search_information?: { total_results?: number };
  error?: string;
}

type EbaySearchAttempt =
  | { ok: true; data: EbayApiData }
  | { ok: false; reason: string };

async function runEbaySearchAttempt(
  apiKey: string,
  cleanQuery: string,
  customerKey: string,
  isPro: boolean,
): Promise<EbaySearchAttempt> {
  // P0-8: per-Pro-customer monthly budget cap.
  const budgetOk = await checkProviderBudget("searchapi", customerKey, isPro);
  if (!budgetOk) {
    return { ok: false, reason: "budget_cap_searchapi" };
  }

  try {
    const params = new URLSearchParams({
      engine: "ebay_search",
      q: cleanQuery,
      filters: "sold_listings",
      api_key: apiKey,
    });
    const response = await fetch(
      `https://www.searchapi.io/api/v1/search?${params.toString()}`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        reason: `http_${response.status}${text ? `: ${text.slice(0, 120).replace(/\s+/g, " ")}` : ""}`,
      };
    }
    const data = (await response.json()) as EbayApiData;
    if (data.error) {
      return {
        ok: false,
        reason: `api_error: ${String(data.error).slice(0, 200)}`,
      };
    }
    return { ok: true, data };
  } catch (err: unknown) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout_12s" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `fetch_error: ${message.slice(0, 200)}` };
  }
}

// --- SerpAPI fallback (used when SearchAPI fails) -------------------------
// SerpAPI's eBay engine returns a similar but not identical shape. We
// normalize it into our EbayApiData type so parseEbayResults can consume it
// without changes.

interface SerpApiEbayResult {
  title?: string;
  price?: string | { raw?: string; extracted?: number };
  extracted_price?: number;
  condition?: string | { type?: string };
  shipping?:
    | string
    | { raw?: string; extracted?: number; extracted_cost?: number };
  shipping_cost?: number;
  extracted_shipping_cost?: number;
  link?: string;
  thumbnail?: string;
  sold_date?: string;
  date?: string;
  id?: string;
}

interface SerpApiEbayResponse {
  organic_results?: SerpApiEbayResult[];
  search_information?: { total_results?: number };
  error?: string;
}

async function runEbaySerpApiAttempt(
  apiKey: string,
  cleanQuery: string,
  customerKey: string,
  isPro: boolean,
): Promise<EbaySearchAttempt> {
  // P0-8: per-Pro-customer monthly budget cap.
  const budgetOk = await checkProviderBudget("serpapi", customerKey, isPro);
  if (!budgetOk) {
    return { ok: false, reason: "budget_cap_serpapi" };
  }

  try {
    const params = new URLSearchParams({
      engine: "ebay",
      _nkw: cleanQuery,
      LH_Sold: "1",
      LH_Complete: "1",
      api_key: apiKey,
    });
    // SerpAPI scrapes eBay live, so cold queries can be slow. Cached
    // queries return in <1s. Give it more headroom than SearchAPI.
    const response = await fetch(
      `https://serpapi.com/search.json?${params.toString()}`,
      { signal: AbortSignal.timeout(18000) },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        reason: `serpapi_http_${response.status}${text ? `: ${text.slice(0, 120).replace(/\s+/g, " ")}` : ""}`,
      };
    }
    const raw = (await response.json()) as SerpApiEbayResponse;
    if (raw.error) {
      return {
        ok: false,
        reason: `serpapi_error: ${String(raw.error).slice(0, 200)}`,
      };
    }

    const organicResults = Array.isArray(raw.organic_results)
      ? raw.organic_results
      : [];

    // Last-resort: pull a number out of a price string like "$267.54" or
    // "+$1,299.00 / Best Offer" so we don't drop valid listings just because
    // SerpAPI changed its extracted-numeric field name.
    const parsePriceString = (s: string | undefined): number => {
      if (typeof s !== "string") return 0;
      const match = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
      if (!match) return 0;
      const n = parseFloat(match[1]);
      return Number.isFinite(n) && n > 0 ? n : 0;
    };

    const normalized: EbayApiResult[] = organicResults.map((r, idx) => {
      const priceStrCandidate =
        typeof r.price === "string"
          ? r.price
          : typeof r.price === "object" &&
              r.price !== null &&
              typeof r.price.raw === "string"
            ? r.price.raw
            : "";
      const extractedPrice =
        typeof r.extracted_price === "number" && r.extracted_price > 0
          ? r.extracted_price
          : typeof r.price === "object" &&
              r.price !== null &&
              typeof r.price.extracted === "number" &&
              r.price.extracted > 0
            ? r.price.extracted
            : parsePriceString(priceStrCandidate);
      const priceStr =
        typeof r.price === "string"
          ? r.price
          : typeof r.price === "object" &&
              r.price !== null &&
              typeof r.price.raw === "string"
            ? r.price.raw
            : extractedPrice > 0
              ? `$${extractedPrice.toFixed(2)}`
              : "";
      const conditionStr =
        typeof r.condition === "string"
          ? r.condition
          : typeof r.condition === "object" &&
              r.condition !== null &&
              typeof r.condition.type === "string"
            ? r.condition.type
            : undefined;
      const extractedShipping =
        typeof r.extracted_shipping_cost === "number"
          ? r.extracted_shipping_cost
          : typeof r.shipping_cost === "number"
            ? r.shipping_cost
            : typeof r.shipping === "object" && r.shipping !== null
              ? typeof r.shipping.extracted === "number"
                ? r.shipping.extracted
                : typeof r.shipping.extracted_cost === "number"
                  ? r.shipping.extracted_cost
                  : 0
              : 0;
      // Shipping display logic:
      // - String form: trust it as-is.
      // - Object with raw: use the raw string verbatim (don't invent values).
      // - Object without raw: only synthesize a string when we have a real
      //   parsed cost. If shipping is present but unparseable, return ""
      //   rather than misleading the user with "Free shipping".
      // - Field absent entirely: keep the legacy "Free shipping" default.
      const shippingStr =
        typeof r.shipping === "string"
          ? r.shipping
          : typeof r.shipping === "object" && r.shipping !== null
            ? typeof r.shipping.raw === "string"
              ? r.shipping.raw
              : extractedShipping > 0
                ? `$${extractedShipping.toFixed(2)} shipping`
                : ""
            : extractedShipping > 0
              ? `$${extractedShipping.toFixed(2)} shipping`
              : "Free shipping";

      return {
        position: idx + 1,
        item_id: r.id,
        title: r.title,
        price: priceStr,
        extracted_price: extractedPrice,
        condition: conditionStr,
        shipping: shippingStr,
        extracted_shipping: extractedShipping,
        link: r.link,
        thumbnail: r.thumbnail,
        sold_date: r.sold_date || r.date,
      };
    });

    return {
      ok: true,
      data: {
        organic_results: normalized,
        search_information: raw.search_information,
      },
    };
  } catch (err: unknown) {
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "serpapi_timeout_18s" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `serpapi_fetch_error: ${message.slice(0, 200)}`,
    };
  }
}

// --- SearchAPI-first waterfall --------------------------------------------
// Try SearchAPI first; only fall back to SerpAPI when SearchAPI either
// fails outright (timeout, HTTP error, fetch error) or returns zero usable
// priced results. SearchAPI is the preferred primary because it returns
// pre-parsed JSON directly from eBay in ~1-2s; SerpAPI is the safety net
// for the rare windows when SearchAPI is degraded.
//
// Hard cap stays at 2 external calls per query (1 if SearchAPI succeeds).
// Auto-broaden adds 2 more calls (a second waterfall), only on the
// strict-zero path. Maximum 4 external calls per request.
// Worst-case wall clock per waterfall: ~30s (SearchAPI 12s + SerpAPI 18s).

type ProviderName = "serpapi" | "searchapi";

interface EbayCascadeOutcome {
  data: EbayApiData | null;
  via: ProviderName | null;
  serpReason: string;
  searchReason: string;
}

const countUsablePricedResults = (a: EbaySearchAttempt): number => {
  if (!a.ok) return 0;
  const results = Array.isArray(a.data.organic_results)
    ? a.data.organic_results
    : [];
  return results.filter(
    (r) => typeof r.extracted_price === "number" && r.extracted_price > 0,
  ).length;
};

const describeAttempt = (a: EbaySearchAttempt): string =>
  a.ok ? `ok_${countUsablePricedResults(a)}` : a.reason;

async function runEbayWaterfall(
  searchApiKey: string,
  serpApiKey: string | undefined,
  query: string,
  customerKey: string,
  isPro: boolean,
): Promise<EbayCascadeOutcome> {
  // Step 1: SearchAPI (priority).
  const searchAttempt = await runEbaySearchAttempt(
    searchApiKey,
    query,
    customerKey,
    isPro,
  );
  if (countUsablePricedResults(searchAttempt) > 0) {
    return {
      data: searchAttempt.ok ? searchAttempt.data : null,
      via: "searchapi",
      serpReason: "skipped_searchapi_won",
      searchReason: describeAttempt(searchAttempt),
    };
  }

  // Step 2: SearchAPI didn't yield usable results — try SerpAPI as fallback.
  const serpAttempt: EbaySearchAttempt = serpApiKey
    ? await runEbaySerpApiAttempt(serpApiKey, query, customerKey, isPro)
    : { ok: false, reason: "no_serpapi_key" };

  if (countUsablePricedResults(serpAttempt) > 0) {
    return {
      data: serpAttempt.ok ? serpAttempt.data : null,
      via: "serpapi",
      serpReason: describeAttempt(serpAttempt),
      searchReason: describeAttempt(searchAttempt),
    };
  }

  // Neither provider produced usable results.
  return {
    data: null,
    via: null,
    serpReason: describeAttempt(serpAttempt),
    searchReason: describeAttempt(searchAttempt),
  };
}

// True only when BOTH providers failed outright (neither returned a 2xx).
// One ok-but-empty + one failure is treated as a real "no results" because
// at least one provider confirmed the absence of sold listings. The
// "skipped_searchapi_won" sentinel never appears in failure paths (SearchAPI
// winning means we already returned data), but we exclude it defensively.
const isCascadeTotalServiceFailure = (outcome: EbayCascadeOutcome): boolean =>
  !outcome.serpReason.startsWith("ok_") &&
  !outcome.searchReason.startsWith("ok_") &&
  outcome.serpReason !== "skipped_searchapi_won";

// P0-8 UX: when the cascade failure is specifically because the per-Pro
// monthly cap was hit (not a real provider outage), surface that as a
// distinct response so the client can render a "you're out of scans this
// month" UI instead of the generic "service error". Detection: any of the
// reasons starts with "budget_cap_". The hit provider name is encoded after
// the prefix (e.g. "budget_cap_searchapi").
function detectBudgetCap(
  outcome: EbayCascadeOutcome,
): { provider: ProviderName } | null {
  const reasons = [outcome.serpReason, outcome.searchReason];
  for (const r of reasons) {
    if (r.startsWith("budget_cap_")) {
      const name = r.slice("budget_cap_".length) as ProviderName;
      return { provider: name };
    }
  }
  return null;
}

// First day of next calendar month (UTC), as ISO. The client shows this as
// a "resets in N days" countdown. Per-customer caps reset at month rollover.
function nextMonthResetIso(): string {
  const now = new Date();
  const nextMonthUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );
  return new Date(nextMonthUtc).toISOString();
}

// Server cap source-of-truth. Reads the same env-overridable defaults as
// server/provider-budget.ts so the `rateLimit.cap` value the client shows
// always matches the cap the server is actually enforcing — even if the
// owner has bumped a particular cap via env var (e.g. PRO_CAP_SEARCHAPI=2000).
function getDisplayedCap(provider: ProviderName): number {
  const envOverrides: Record<ProviderName, string | undefined> = {
    searchapi: process.env.PRO_CAP_SEARCHAPI,
    serpapi: process.env.PRO_CAP_SERPAPI,
  };
  const defaults: Record<ProviderName, number> = {
    searchapi: 1000,
    serpapi: 100,
  };
  const raw = envOverrides[provider];
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return defaults[provider];
}

// P0-8 contract for the client.
// New-client builds (after the next App Store release) recognize this shape
// and render a cooldown screen with a "contact us to raise the cap" CTA.
// Old-client builds ignore the extra `rateLimit` field and fall back to the
// existing `serviceError: true` UI — so deploying the backend before the
// new client is fully backward compatible.
type RateLimitInfo = {
  cap: number;
  provider: ProviderName | "scan-with-lens";
  resetAt: string;
  isPro: true;
  contactEmail: string;
};

const PRO_CONTACT_EMAIL = "pricerpocket@gmail.com";

function buildEbayRateLimitPayload(provider: ProviderName) {
  const info: RateLimitInfo = {
    cap: getDisplayedCap(provider),
    provider,
    resetAt: nextMonthResetIso(),
    isPro: true,
    contactEmail: PRO_CONTACT_EMAIL,
  };
  return info;
}

interface EbayParsedPayload {
  avgSoldPrice: number;
  medianSoldPrice: number;
  lowPrice: number;
  highPrice: number;
  totalSold: number;
  avgSoldPerMonth: number;
  items: {
    id: string;
    title: string;
    price: number;
    condition?: string;
    shipping: number;
    link: string;
    imageUrl: string;
    soldDate?: string;
  }[];
}

function parseEbayResults(data: EbayApiData): {
  items: EbayParsedPayload["items"];
  avgSoldPrice: number;
  payload: EbayParsedPayload;
} {
  const results = data.organic_results || [];
  const items = results
    .filter((r) => r.extracted_price && r.extracted_price > 0)
    .map((r, index) => ({
      id: `ebay-sold-${index}`,
      title: r.title || "Unknown Item",
      price: r.extracted_price || 0,
      condition: r.condition,
      shipping: r.extracted_shipping || 0,
      link: r.link || "",
      imageUrl: r.thumbnail || "",
      soldDate: r.sold_date || r.extracted_sold_date || undefined,
    }));

  const prices = items.map((i) => i.price);
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sortedPrices.length / 2);
  const medianSoldPrice =
    sortedPrices.length === 0
      ? 0
      : sortedPrices.length % 2 !== 0
        ? sortedPrices[mid]
        : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;

  const avgSoldPrice =
    prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

  const soldDates = results
    .map((r) => {
      if (r.extracted_sold_date)
        return new Date(r.extracted_sold_date + "T00:00:00Z").getTime();
      if (r.sold_date) {
        const cleaned = r.sold_date.replace(/^Sold\s+/i, "");
        const parsed = new Date(cleaned).getTime();
        if (!isNaN(parsed)) return parsed;
      }
      return NaN;
    })
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  let avgSoldPerMonth = 0;
  if (soldDates.length >= 2) {
    const oldest = soldDates[0];
    const newest = soldDates[soldDates.length - 1];
    const monthsSpan = Math.max(
      (newest - oldest) / (1000 * 60 * 60 * 24 * 30.44),
      0.5,
    );
    avgSoldPerMonth = Math.round(soldDates.length / monthsSpan);
  } else if (soldDates.length === 1) {
    avgSoldPerMonth = 1;
  }

  const payload: EbayParsedPayload = {
    avgSoldPrice,
    medianSoldPrice,
    lowPrice: prices.length > 0 ? Math.min(...prices) : 0,
    highPrice: prices.length > 0 ? Math.max(...prices) : 0,
    totalSold: data.search_information?.total_results || items.length,
    avgSoldPerMonth,
    items,
  };

  return { items, avgSoldPrice, payload };
}

const blockedSources = [
  "alibaba",
  "aliexpress",
  "temu",
  "wish",
  "dhgate",
  "banggood",
  "tiktok",
  "shein",
  "made-in-china",
  "lightinthebox",
  "gearbest",
  "tomtop",
  "miniinthebox",
  "sammydress",
  "rosegal",
  "zaful",
];

const isReliableSource = (source: string) => {
  const lowerSource = (source || "").toLowerCase();
  return !blockedSources.some((blocked) => lowerSource.includes(blocked));
};

const nonProductSources = [
  "reddit",
  "pinterest",
  "youtube",
  "youtu.be",
  "tiktok",
  "quora",
  "facebook",
  "instagram",
  "twitter",
  "x.com",
  "tumblr",
  "medium",
  "imgur",
  "blogspot",
  "wordpress",
  "substack",
  "flickr",
  "vimeo",
  "linkedin",
  "snapchat",
  "threads.net",
  "discord",
  "twitch",
];

const isProductLikeSource = (source: string) => {
  const lowerSource = (source || "").toLowerCase();
  if (!lowerSource) return false;
  if (blockedSources.some((blocked) => lowerSource.includes(blocked)))
    return false;
  if (nonProductSources.some((np) => lowerSource.includes(np))) return false;
  return true;
};

export async function registerRoutes(app: Express): Promise<Server> {
  initScanImagesBucket().catch((err) => {
    console.error("Failed to init scan-images bucket:", err?.message);
  });

  app.post("/api/scan-with-lens", async (req: Request, res: Response) => {
    let supabaseFileName: string | null = null;
    try {
      const deviceId = req.headers["x-device-id"] as string | undefined;
      const isPro = req.headers["x-is-pro"] === "true";

      if (!deviceId) {
        return res.status(400).json({ error: "Device ID is required" });
      }

      if (isRateLimited(deviceId)) {
        return res.status(429).json({
          error: "Too many requests. Please wait a moment and try again.",
        });
      }

      if (!isPro) {
        const guestCount = await getGuestScanCount(deviceId);
        if (guestCount >= FREE_LIFETIME_SEARCHES) {
          return res.status(403).json({
            error: "Free scan limit reached",
            limitReached: true,
            searchesRemaining: 0,
          });
        }
      }

      const { imageBase64 } = req.body;

      if (!imageBase64) {
        return res.status(400).json({ error: "Image data is required" });
      }

      console.log("Uploading image for Google Lens search...");
      const uploadResult = await uploadImageForLens(imageBase64);

      if (!uploadResult) {
        return res
          .status(500)
          .json({ error: "Failed to prepare image for search" });
      }

      const { url: imageUrl } = uploadResult;
      supabaseFileName = uploadResult.supabaseFileName;

      console.log("Searching with Google Lens...");
      const lensResult = await searchWithGoogleLens(imageUrl, deviceId, isPro);

      // P0-8 UX: distinguish "Lens couldn't identify the product" from "this
      // Pro user has used all their monthly Lens scans". The latter must NOT
      // tell the client to fall back to the text-search path, because the
      // text-search path uses the same SearchAPI quota that's already gone.
      const lensBudgetHit =
        typeof lensResult.error === "string" &&
        lensResult.error.startsWith("budget_cap_");
      if (lensBudgetHit) {
        if (supabaseFileName) deleteSupabaseImage(supabaseFileName);
        const provider = lensResult.error!.slice(
          "budget_cap_".length,
        ) as ProviderName;
        return res.status(200).json({
          rateLimit: buildEbayRateLimitPayload(provider),
        });
      }

      if (lensResult.error || lensResult.products.length === 0) {
        // Lens didn't find anything — clean up the upload, no point keeping it.
        if (supabaseFileName) deleteSupabaseImage(supabaseFileName);
        return res.status(404).json({
          error: "No products found",
          fallbackToText: true,
        });
      }

      // From here on the scan is "successful" — track the image so we can
      // surface the user's photo on inventory cards / recent scans, and so the
      // prune helper knows it exists. Only do this when the upload landed in
      // our own Supabase bucket (fallback hosts are out of our control).
      if (supabaseFileName) {
        await insertScanImage(deviceId, supabaseFileName, imageUrl);
      }

      const allProducts = lensResult.products.slice(0, 60);

      const reliableProducts = allProducts.filter((p) =>
        isReliableSource(p.source || ""),
      );
      const pricedProducts = reliableProducts.filter(
        (p) => p.price?.value || p.price?.extracted_value,
      );
      const noPriceProducts = reliableProducts.filter(
        (p) => !(p.price?.value || p.price?.extracted_value),
      );

      console.log(
        `Breakdown: ${allProducts.length} total, ${pricedProducts.length} with prices, ${noPriceProducts.length} no price (reliable only)`,
      );

      const prices = pricedProducts
        .map((p) => p.price?.extracted_value || p.price?.value || 0)
        .filter((p) => p > 0);

      const avgListPrice = calculateMedian(prices);
      const bestBuyNow = prices.length > 0 ? Math.min(...prices) : 0;

      const pricedListings = pricedProducts.map((item, index) => ({
        id: `lens-${index}`,
        title: item.title || "Unknown Product",
        imageUrl: item.thumbnail || "",
        currentPrice: item.price?.extracted_value || item.price?.value || 0,
        shipping: 0,
        link: item.link || "",
        seller: item.source || "",
        platform: item.source || "Shop",
        rating: item.rating,
        reviews: item.reviews,
      }));

      const remainingSlots = Math.max(0, 30 - pricedListings.length);
      const noPriceListings = noPriceProducts
        .slice(0, remainingSlots)
        .map((item, index) => ({
          id: `lens-np-${index}`,
          title: item.title || "Unknown Product",
          imageUrl: item.thumbnail || "",
          currentPrice: 0,
          shipping: 0,
          link: item.link || "",
          seller: item.source || "",
          platform: item.source || "Shop",
          rating: item.rating,
          reviews: item.reviews,
        }));

      const listings = [...pricedListings, ...noPriceListings];
      console.log(
        `Returning ${pricedListings.length} priced + ${noPriceListings.length} check-price = ${listings.length} total listings`,
      );

      const knowledgeGraphName = lensResult.productName?.trim();
      const productLikeListing = listings.find((l) =>
        isProductLikeSource(l.seller || l.platform || ""),
      );
      let productName: string;
      let titleSource: string;
      if (knowledgeGraphName) {
        productName = knowledgeGraphName;
        titleSource = "knowledge_graph";
      } else if (productLikeListing?.title) {
        productName = productLikeListing.title;
        titleSource = `listing:${productLikeListing.seller || productLikeListing.platform}`;
      } else {
        productName = "Likely not worth reselling";
        titleSource = "fallback";
      }
      console.log(`[Scan] Title source: ${titleSource} -> "${productName}"`);

      if (!isPro) {
        await incrementGuestScan(deviceId);
      }

      let totalScans = 0;
      try {
        totalScans = await getGuestScanCount(deviceId);
      } catch {}

      logScanEvent(
        deviceId,
        isPro,
        productName,
        listings.length,
        pricedListings.length,
      );

      const ebaySeedQuery = titleSource === "fallback" ? "" : productName;
      res.json({
        query: ebaySeedQuery,
        productName,
        productInfo: {
          name: productName,
        },
        totalListings: listings.length,
        avgListPrice,
        avgSalePrice: null,
        soldCount: 0,
        bestBuyNow,
        topSalePrice: null,
        listings,
        usedLens: true,
        totalScans,
        // Hosted URL of the user's actual scan photo (Supabase Storage). The
        // client persists this on the scan-history item and on any inventory
        // item the user creates, so cards show the user's photo instead of a
        // scraped product thumbnail. Only set when the upload landed in our
        // own bucket — fallback hosts return an opaque URL we can't manage.
        scannedImageUrl: supabaseFileName ? imageUrl : null,
      });

      // Fire-and-forget: enforce the recent-10 retention window. Any scan
      // image past #10 that isn't pinned by an inventory_items row gets
      // deleted from storage. Errors are swallowed inside the helper.
      pruneDeviceScanImages(deviceId);
    } catch (error) {
      if (supabaseFileName) deleteSupabaseImage(supabaseFileName);
      console.error("Lens scan error:", error);
      res.status(500).json({ error: "Failed to scan product" });
    }
  });

  app.post("/api/ebay-sold-search", async (req: Request, res: Response) => {
    try {
      const deviceId = req.headers["x-device-id"] as string | undefined;
      const isPro = req.headers["x-is-pro"] === "true";

      if (!deviceId) {
        return res.status(400).json({ error: "Device ID is required" });
      }

      if (isRateLimited(deviceId)) {
        return res.status(429).json({
          error: "Too many requests. Please wait a moment and try again.",
        });
      }

      if (!isPro) {
        const guestCount = await getGuestScanCount(deviceId);
        if (guestCount >= FREE_LIFETIME_SEARCHES) {
          return res.status(403).json({
            error: "Free scan limit reached",
            limitReached: true,
          });
        }
      }

      const { searchQuery, broadSearch, listingTitles } = req.body;
      if (!searchQuery) {
        return res.status(400).json({ error: "Search query is required" });
      }
      if (typeof searchQuery !== "string" || searchQuery.length > 500) {
        return res.status(400).json({ error: "Invalid search query" });
      }
      if (searchQuery.trim().length === 0) {
        return res.status(400).json({ error: "Search query is required" });
      }

      // SearchAPI is the primary provider and is required. SerpAPI is the
      // optional fallback used only when SearchAPI fails outright or returns
      // zero usable priced results (see `runEbayWaterfall` above).
      const apiKey = process.env.SEARCHAPI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Search API key not configured" });
      }
      const serpApiKey = process.env.SERPAPI_API_KEY;

      const sanitizedListingTitles = Array.isArray(listingTitles)
        ? (listingTitles as unknown[])
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.replace(/\s+/g, " ").trim())
            .filter((t) => t.length > 0 && t.length <= 200)
            .slice(0, 5)
        : [];

      const aiCleaned = broadSearch
        ? null
        : await cleanQueryWithAI(
            searchQuery,
            sanitizedListingTitles,
            deviceId,
            isPro,
          );

      const strictQuery = buildEbaySearchQuery(searchQuery, false, aiCleaned);
      const broadQuery = buildEbaySearchQuery(searchQuery, true, null);
      const initialQuery = broadSearch ? broadQuery : strictQuery;

      console.log(
        `eBay sold search — original: "${searchQuery.slice(0, 60)}" | AI-cleaned: "${aiCleaned ?? "(skipped)"}" | strict: "${strictQuery}" | broad: "${broadQuery}" | starting: "${initialQuery}"`,
      );

      const emptyPayload = {
        avgSoldPrice: 0,
        medianSoldPrice: 0,
        lowPrice: 0,
        highPrice: 0,
        totalSold: 0,
        avgSoldPerMonth: 0,
        items: [],
      };

      // SearchAPI-first waterfall: try SearchAPI; only fall back to SerpAPI
      // when SearchAPI fails outright or returns zero usable priced results.
      const initialOutcome = await runEbayWaterfall(
        apiKey,
        serpApiKey,
        initialQuery,
        deviceId,
        isPro,
      );
      console.log(
        `eBay sold search initial — via: ${initialOutcome.via ?? "none"} | serpapi: ${initialOutcome.serpReason} | searchapi: ${initialOutcome.searchReason}`,
      );

      if (initialOutcome.data) {
        const parsed = parseEbayResults(initialOutcome.data);
        console.log(
          `eBay sold search via ${initialOutcome.via} returned ${parsed.items.length} processable items`,
        );
        if (parsed.items.length > 0) {
          logEbaySearchEvent(
            deviceId,
            isPro,
            initialQuery,
            !!broadSearch,
            parsed.items.length,
            parsed.avgSoldPrice,
            `via_${initialOutcome.via} | serpapi: ${initialOutcome.serpReason} | searchapi: ${initialOutcome.searchReason}`,
          );
          // P0-7: count this against the free-tier lifetime quota the same
          // way /api/scan-with-lens does. Without this, free users can hit
          // /api/ebay-sold-search unlimited times because the limit check at
          // the top of the handler reads a counter that's only ever bumped
          // by the lens endpoint. Increments only on actual successful
          // results so a 404 / serviceError doesn't burn a scan.
          if (!isPro) {
            incrementGuestScan(deviceId).catch((err) =>
              console.error("incrementGuestScan failed:", err?.message),
            );
          }
          return res.json(parsed.payload);
        }
        // Provider returned usable raw results but downstream parsing dropped
        // them all (e.g. all listings filtered out by sanity rules). Treat
        // as empty.
      }

      // No usable results from either provider. Decide between
      // budget-cap, serviceError, noResults, and auto-broaden.
      const initialBudgetCap = detectBudgetCap(initialOutcome);
      if (initialBudgetCap) {
        // P0-8 UX: don't disguise a cap hit as a service error. Surface a
        // structured rateLimit payload so a new-client build can render the
        // "you're out of scans this month" UX with a contact-support CTA.
        const combinedReason = `budget_cap_hit | serpapi: ${initialOutcome.serpReason} | searchapi: ${initialOutcome.searchReason}`;
        console.warn(
          `eBay sold search budget cap hit (${initialBudgetCap.provider}) for device ${deviceId.slice(0, 12)}…`,
        );
        logEbaySearchEvent(
          deviceId,
          isPro,
          initialQuery,
          !!broadSearch,
          0,
          0,
          combinedReason,
        );
        return res.json({
          ...emptyPayload,
          // Backward-compat for old client builds: they show the existing
          // "service error" UI. New builds detect `rateLimit` first.
          serviceError: true,
          rateLimit: buildEbayRateLimitPayload(initialBudgetCap.provider),
        });
      }

      if (isCascadeTotalServiceFailure(initialOutcome)) {
        const combinedReason = `serpapi: ${initialOutcome.serpReason} | searchapi: ${initialOutcome.searchReason}`;
        console.error(
          `eBay sold search both providers failed: ${combinedReason}`,
        );
        logEbaySearchEvent(
          deviceId,
          isPro,
          initialQuery,
          !!broadSearch,
          0,
          0,
          combinedReason,
        );
        return res.json({ ...emptyPayload, serviceError: true });
      }

      // At least one provider responded with a real (but empty) result set.
      // If the user already chose broad search or strict==broad, we're done.
      if (broadSearch || broadQuery === strictQuery) {
        logEbaySearchEvent(
          deviceId,
          isPro,
          initialQuery,
          !!broadSearch,
          0,
          0,
          `no_results | serpapi: ${initialOutcome.serpReason} | searchapi: ${initialOutcome.searchReason}`,
        );
        // P0-7: a real "no results" response still consumed paid provider
        // calls and used a free-tier search slot. Count it.
        if (!isPro) {
          incrementGuestScan(deviceId).catch((err) =>
            console.error("incrementGuestScan failed:", err?.message),
          );
        }
        return res.json({ ...emptyPayload, noResults: true });
      }

      // Strict-zero path: auto-broaden via a second SearchAPI-first
      // waterfall using the broadened query.
      console.log(
        `eBay sold search auto-broadening: "${strictQuery}" → "${broadQuery}"`,
      );
      const broadOutcome = await runEbayWaterfall(
        apiKey,
        serpApiKey,
        broadQuery,
        deviceId,
        isPro,
      );
      console.log(
        `eBay auto-broaden — via: ${broadOutcome.via ?? "none"} | serpapi: ${broadOutcome.serpReason} | searchapi: ${broadOutcome.searchReason}`,
      );

      if (broadOutcome.data) {
        const parsed = parseEbayResults(broadOutcome.data);
        console.log(
          `eBay auto-broaden via ${broadOutcome.via} returned ${parsed.items.length} processable items`,
        );
        if (parsed.items.length > 0) {
          logEbaySearchEvent(
            deviceId,
            isPro,
            broadQuery,
            true,
            parsed.items.length,
            parsed.avgSoldPrice,
            `broadened_via_${broadOutcome.via} | serpapi: ${broadOutcome.serpReason} | searchapi: ${broadOutcome.searchReason}`,
          );
          // P0-7: see comment at the strict-results branch above.
          if (!isPro) {
            incrementGuestScan(deviceId).catch((err) =>
              console.error("incrementGuestScan failed:", err?.message),
            );
          }
          return res.json({
            ...parsed.payload,
            broadenedFromStrict: true,
            isBroadSearch: true,
          });
        }
      }

      // Broaden also failed. Decide budget-cap vs noResults vs serviceError.
      const broadBudgetCap = detectBudgetCap(broadOutcome);
      if (broadBudgetCap) {
        const combinedReason = `auto_broaden_budget_cap_hit | serpapi: ${broadOutcome.serpReason} | searchapi: ${broadOutcome.searchReason}`;
        console.warn(
          `eBay auto-broaden budget cap hit (${broadBudgetCap.provider}) for device ${deviceId.slice(0, 12)}…`,
        );
        logEbaySearchEvent(
          deviceId,
          isPro,
          broadQuery,
          true,
          0,
          0,
          combinedReason,
        );
        return res.json({
          ...emptyPayload,
          serviceError: true,
          rateLimit: buildEbayRateLimitPayload(broadBudgetCap.provider),
        });
      }

      if (isCascadeTotalServiceFailure(broadOutcome)) {
        const combinedReason = `auto_broaden_failed | serpapi: ${broadOutcome.serpReason} | searchapi: ${broadOutcome.searchReason}`;
        console.warn(`eBay auto-broaden failed: ${combinedReason}`);
        logEbaySearchEvent(
          deviceId,
          isPro,
          broadQuery,
          true,
          0,
          0,
          combinedReason,
        );
        return res.json({ ...emptyPayload, serviceError: true });
      }

      logEbaySearchEvent(
        deviceId,
        isPro,
        broadQuery,
        true,
        0,
        0,
        `no_results_after_broaden | serpapi: ${broadOutcome.serpReason} | searchapi: ${broadOutcome.searchReason}`,
      );
      // P0-7: see comment at the strict-results branch above. Auto-broaden
      // ran, so this consumed up to 4 paid provider calls — definitely worth
      // counting against the free-tier quota.
      if (!isPro) {
        incrementGuestScan(deviceId).catch((err) =>
          console.error("incrementGuestScan failed:", err?.message),
        );
      }
      return res.json({ ...emptyPayload, noResults: true });
    } catch (error) {
      console.error("eBay sold search error:", error);
      // Best-effort analytics for unhandled exceptions so failure rate is
      // visible — pulls device/query info from the request if available.
      try {
        const deviceId =
          (req.headers["x-device-id"] as string | undefined) || "unknown";
        const isPro = req.headers["x-is-pro"] === "true";
        const rawQuery =
          typeof req.body?.searchQuery === "string"
            ? req.body.searchQuery.slice(0, 200)
            : "(unknown)";
        const isBroad = !!req.body?.broadSearch;
        const reason = error instanceof Error ? error.message : String(error);
        logEbaySearchEvent(
          deviceId,
          isPro,
          rawQuery,
          isBroad,
          0,
          0,
          `unhandled_exception: ${reason.slice(0, 200)}`,
        );
      } catch {
        // analytics is best-effort — never let it shadow the original error
      }
      res.status(500).json({ error: "Failed to search eBay sold data" });
    }
  });

  app.get(
    "/api/device-stats/:deviceId",
    async (req: Request, res: Response) => {
      try {
        const deviceId = req.params.deviceId;
        if (typeof deviceId !== "string" || !deviceId) {
          return res.status(400).json({ error: "Missing deviceId" });
        }
        if (isRateLimited(deviceId)) {
          return res.status(429).json({
            error: "Too many requests. Please wait a moment and try again.",
          });
        }
        const tzOffsetStr = req.headers["x-timezone-offset"] as
          | string
          | undefined;
        const tzOffsetMinutes = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0;
        const stats = await getDeviceStats(
          deviceId,
          isNaN(tzOffsetMinutes) ? 0 : tzOffsetMinutes,
        );
        res.json(stats);
      } catch (error) {
        console.error("Device stats error:", error);
        res.status(500).json({ error: "Failed to fetch device stats" });
      }
    },
  );

  const isValidDeviceId = (id: unknown): id is string =>
    typeof id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(id);

  // Server-side defense in depth: even though the current client cleans
  // and truncates productName via cleanInventoryName(), enforce the same
  // invariants here so a buggy or future client (or any direct API caller)
  // can never store control characters, zero-width chars, or oversized
  // strings in the database. Mirrors client/lib/storage.ts: 50-char cap,
  // strip C0/C1 controls + bidi/format/BOM chars, collapse whitespace.
  const SERVER_INVENTORY_NAME_MAX = 50;
  const sanitizeInventoryName = (input: unknown): string => {
    if (typeof input !== "string") return "";
    let s = input;
    s = s.replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g,
      "",
    );
    s = s.replace(/\s+/g, " ").trim();
    if (s.length > SERVER_INVENTORY_NAME_MAX) {
      s = s.slice(0, SERVER_INVENTORY_NAME_MAX).trimEnd();
    }
    return s;
  };

  app.get("/api/inventory/:deviceId", async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      if (!isValidDeviceId(deviceId))
        return res.status(400).json({ error: "Invalid deviceId" });
      if (isInventoryRateLimited(deviceId)) {
        return res.status(429).json({
          error: "Too many requests. Please wait a moment and try again.",
        });
      }
      const items = await listInventory(deviceId);
      res.json({ items });
    } catch (error) {
      console.error("List inventory error:", error);
      res.status(500).json({ error: "Failed to load inventory" });
    }
  });

  app.post("/api/inventory/:deviceId", async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      if (!isValidDeviceId(deviceId))
        return res.status(400).json({ error: "Invalid deviceId" });
      if (isInventoryRateLimited(deviceId)) {
        return res.status(429).json({
          error: "Too many requests. Please wait a moment and try again.",
        });
      }
      const {
        id,
        productName,
        imageUrl,
        purchasePrice,
        purchasedAt,
        notes,
        soldPrice,
        soldAt,
        sourceScanId,
      } = req.body || {};
      if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "Missing item id" });
      }
      if (!productName || typeof productName !== "string") {
        return res.status(400).json({ error: "Missing productName" });
      }
      const cleanedName = sanitizeInventoryName(productName);
      if (!cleanedName) {
        return res.status(400).json({ error: "Missing productName" });
      }
      const price = Number(purchasePrice);
      if (!isFinite(price) || price < 0) {
        return res.status(400).json({ error: "Invalid purchasePrice" });
      }
      const created = await createInventoryItem(deviceId, {
        id,
        productName: cleanedName,
        imageUrl: typeof imageUrl === "string" ? imageUrl : null,
        purchasePrice: price,
        purchasedAt: typeof purchasedAt === "string" ? purchasedAt : undefined,
        notes: typeof notes === "string" ? notes : null,
        soldPrice: typeof soldPrice === "number" ? soldPrice : null,
        soldAt: typeof soldAt === "string" ? soldAt : null,
        sourceScanId: typeof sourceScanId === "string" ? sourceScanId : null,
      });
      if (!created)
        return res.status(500).json({ error: "Failed to create item" });
      res.json({ item: created });
    } catch (error) {
      console.error("Create inventory error:", error);
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  });

  app.patch(
    "/api/inventory/:deviceId/:itemId",
    async (req: Request, res: Response) => {
      try {
        const deviceId = req.params.deviceId;
        const itemId = req.params.itemId;
        if (
          !isValidDeviceId(deviceId) ||
          typeof itemId !== "string" ||
          !itemId
        ) {
          return res.status(400).json({ error: "Invalid identifiers" });
        }
        if (isInventoryRateLimited(deviceId)) {
          return res.status(429).json({
            error: "Too many requests. Please wait a moment and try again.",
          });
        }
        const {
          productName,
          imageUrl,
          purchasePrice,
          notes,
          soldPrice,
          soldAt,
        } = req.body || {};
        const updates: Parameters<typeof updateInventoryItemRow>[2] = {};
        if (productName !== undefined) {
          const cleanedName = sanitizeInventoryName(productName);
          if (!cleanedName)
            return res.status(400).json({ error: "Invalid productName" });
          updates.productName = cleanedName;
        }
        if (imageUrl !== undefined)
          updates.imageUrl = imageUrl === null ? null : String(imageUrl);
        if (purchasePrice !== undefined) {
          const p = Number(purchasePrice);
          if (!isFinite(p) || p < 0)
            return res.status(400).json({ error: "Invalid purchasePrice" });
          updates.purchasePrice = p;
        }
        if (notes !== undefined)
          updates.notes = notes === null ? null : String(notes);
        if (soldPrice !== undefined) {
          if (soldPrice === null) {
            updates.soldPrice = null;
            updates.soldAt = null;
          } else {
            const p = Number(soldPrice);
            if (!isFinite(p) || p < 0)
              return res.status(400).json({ error: "Invalid soldPrice" });
            updates.soldPrice = p;
            updates.soldAt =
              typeof soldAt === "string" ? soldAt : new Date().toISOString();
          }
        } else if (soldAt !== undefined) {
          updates.soldAt = soldAt === null ? null : String(soldAt);
        }
        const updated = await updateInventoryItemRow(deviceId, itemId, updates);
        if (!updated) return res.status(404).json({ error: "Item not found" });
        res.json({ item: updated });
      } catch (error) {
        console.error("Update inventory error:", error);
        res.status(500).json({ error: "Failed to update inventory item" });
      }
    },
  );

  app.delete(
    "/api/inventory/:deviceId/:itemId",
    async (req: Request, res: Response) => {
      try {
        const deviceId = req.params.deviceId;
        const itemId = req.params.itemId;
        if (
          !isValidDeviceId(deviceId) ||
          typeof itemId !== "string" ||
          !itemId
        ) {
          return res.status(400).json({ error: "Invalid identifiers" });
        }
        if (isInventoryRateLimited(deviceId)) {
          return res.status(429).json({
            error: "Too many requests. Please wait a moment and try again.",
          });
        }
        const ok = await deleteInventoryItem(deviceId, itemId);
        if (!ok)
          return res
            .status(500)
            .json({ error: "Failed to delete inventory item" });
        res.json({ ok: true });
        // Fire-and-forget: the deleted item's photo is no longer pinned by
        // inventory; if it's also outside the recent-10 window, prune cleans
        // it up from Supabase Storage.
        pruneDeviceScanImages(deviceId);
      } catch (error) {
        console.error("Delete inventory error:", error);
        res.status(500).json({ error: "Failed to delete inventory item" });
      }
    },
  );

  const httpServer = createServer(app);

  return httpServer;
}
