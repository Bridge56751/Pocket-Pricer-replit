import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getGuestScanCount, incrementGuestScan } from "./db";
import { logScanEvent, logEbaySearchEvent } from "./supabase";

const FREE_LIFETIME_SEARCHES = 5;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const rateLimitMap = new Map<string, number[]>();

function isRateLimited(deviceId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(deviceId) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(deviceId, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(deviceId, recent);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recent);
    }
  }
}, 5 * 60 * 1000);

async function uploadImageForLens(imageBase64: string): Promise<string | null> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const uploadServices = [
    async () => {
      const formData = new URLSearchParams();
      formData.append("key", process.env.FREEIMAGE_API_KEY || "6d207e02198a847aa98d0a2a901485a5");
      formData.append("source", cleanBase64);
      formData.append("format", "json");
      const response = await fetch("https://freeimage.host/api/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const data = await response.json();
      if (data.status_code === 200 && data.image?.url) return data.image.url;
      return null;
    },
    async () => {
      const formData = new URLSearchParams();
      formData.append("key", process.env.IMGBB_API_KEY || "b4e0e3a7e5e0c4b2d6a8f9c1e3b5d7a9");
      formData.append("image", cleanBase64);
      const response = await fetch("https://api.imgbb.com/1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const data = await response.json();
      if (data.success && data.data?.url) return data.data.url;
      return null;
    },
  ];

  try {
    const results = await Promise.allSettled(uploadServices.map(fn => fn()));
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) return result.value;
    }
  } catch (error) {
    console.error("Image upload failed:", error);
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

async function searchWithGoogleLens(imageUrl: string): Promise<{
  products: GoogleLensProduct[];
  productName?: string;
  error?: string;
}> {
  try {
    const apiKey = process.env.SEARCHAPI_API_KEY;
    if (!apiKey) {
      return { products: [], error: "SearchAPI key not configured" };
    }

    const params = new URLSearchParams({
      engine: "google_lens",
      url: imageUrl,
      hl: "en",
      country: "us",
      no_cache: "true",
      api_key: apiKey,
    });

    const response = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`);
    const data = await response.json() as SearchApiLensResponse;

    if (data.error) {
      console.error("Google Lens error:", data.error);
      return { products: [], error: data.error };
    }

    const products: GoogleLensProduct[] = (data.visual_matches || []).map(item => ({
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
    }));

    const productName = data.knowledge_graph?.[0]?.title;
    
    console.log(`Google Lens found ${products.length} visual matches`);

    return { products, productName };
  } catch (error) {
    console.error("Google Lens search error:", error);
    return { products: [], error: "Search failed" };
  }
}

function calculateMedian(prices: number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const blockedSources = [
  'alibaba', 'aliexpress', 'temu', 'wish', 'dhgate', 'banggood',
  'tiktok', 'shein', 'made-in-china', 'lightinthebox', 'gearbest',
  'tomtop', 'miniinthebox', 'sammydress', 'rosegal', 'zaful'
];

const isReliableSource = (source: string) => {
  const lowerSource = (source || '').toLowerCase();
  return !blockedSources.some(blocked => lowerSource.includes(blocked));
};

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/scan-with-lens", async (req: Request, res: Response) => {
    try {
      const deviceId = req.headers["x-device-id"] as string | undefined;
      const isPro = req.headers["x-is-pro"] === "true";

      if (!deviceId) {
        return res.status(400).json({ error: "Device ID is required" });
      }

      if (isRateLimited(deviceId)) {
        return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
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
      const imageUrl = await uploadImageForLens(imageBase64);
      
      if (!imageUrl) {
        return res.status(500).json({ error: "Failed to prepare image for search" });
      }

      console.log("Searching with Google Lens...");
      const lensResult = await searchWithGoogleLens(imageUrl);

      if (lensResult.error || lensResult.products.length === 0) {
        return res.status(404).json({ 
          error: "No products found",
          fallbackToText: true 
        });
      }

      const allProducts = lensResult.products.slice(0, 60);
      
      const reliableProducts = allProducts.filter(p => isReliableSource(p.source || ''));
      const pricedProducts = reliableProducts.filter(p => p.price?.value || p.price?.extracted_value);
      const noPriceProducts = reliableProducts.filter(p => !(p.price?.value || p.price?.extracted_value));
      
      console.log(`Breakdown: ${allProducts.length} total, ${pricedProducts.length} with prices, ${noPriceProducts.length} no price (reliable only)`);
      
      const prices = pricedProducts
        .map(p => p.price?.extracted_value || p.price?.value || 0)
        .filter(p => p > 0);

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
      const noPriceListings = noPriceProducts.slice(0, remainingSlots).map((item, index) => ({
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
      console.log(`Returning ${pricedListings.length} priced + ${noPriceListings.length} check-price = ${listings.length} total listings`);

      const productName = lensResult.productName
        || listings[0]?.title
        || "Scanned Product";

      if (!isPro) {
        await incrementGuestScan(deviceId);
      }

      let totalScans = 0;
      try {
        totalScans = await getGuestScanCount(deviceId);
      } catch {}

      logScanEvent(deviceId, isPro, productName, listings.length, pricedListings.length);

      res.json({
        query: productName,
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
      });
    } catch (error) {
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
        return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
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

      const { searchQuery, broadSearch } = req.body;
      if (!searchQuery) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const apiKey = process.env.SEARCHAPI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Search API key not configured" });
      }

      let cleanQuery = searchQuery
        .split(/[|·•–—]/).at(0)
        .replace(/free shipping.*/i, "")
        .replace(/\(.*?\)/g, "")
        .replace(/@\w+/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\b(Size|Sz)\s*\d+[\w.]*/gi, "")
        .replace(/\s*-\s*[\w\s]*\/[\w\s/]*$/i, "")
        .replace(/\s*-\s*(?:Peacoat|Navy|Gold|Silver|Ivory|Coral|Teal|Maroon|Burgundy|Olive|Charcoal|Beige|Tan|Cream)[\w\s/]*$/i, "")
        .replace(/\b(Adjustable|Premium|Official|Authentic|Genuine|Brand New|NWT|NWOT|NWB|NIB|NWOB|BNIB|BNWT|BNWOT|MIB|Exclusive)\b/gi, "")
        .replace(/\b(RARE|HTF|MINT|EUC|GUC|VGC|OBO)\b/gi, "")
        .replace(/\b(Fit|Style|Collection|Pack|Bundle|Lot)\b/gi, "")
        .replace(/\b(Ultra-Lightweight|Lightweight|Ultra-Light|Super Light|Ergonomic|High-Performance|High Performance|Advanced|Professional|Next-Gen|Next Gen)\b/gi, "")
        .replace(/\b(with|and|for|the|in|of|by|to|on|at|from|into)\b/gi, "")
        .replace(/\b\d+(?:\.\d+)?\s*(?:CPI|DPI|Hz|MHz|GHz|mm|cm|oz|fl|Fl|ML|ml|mg|g|GB|TB|MB|mAh|W|HP|RPM|PSI|FPS|MP|inch|inches|ft|lb|lbs|kg|ct|pk|pc)\b/gi, "")
        .replace(/\b\d+(?:\.\d+)?(?:g|oz)\b/gi, "")
        .replace(/\b\d+\s*(?:inch|inches|ft|cm|mm|oz|fl|ml|lb|lbs|kg)\b/gi, "")
        .replace(/\b(Sipbox|Boxed)\b/gi, "")
        .replace(/\b(Walmart|Amazon|Target|Nordstrom|Mercari|Poshmark|eBay|Costco|Sam's|Kohls|Macy's|JCPenney|Marshalls|TJ\s*Maxx|HomeGoods|Ross)\b/gi, "")
        .replace(/\b(New|Tags|Size|Sz|Step)\b/gi, "")
        .replace(/\b(Jumbo)\b/gi, "")
        .replace(/[\/,&]+/g, " ")
        .replace(/-+\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();

      let words = cleanQuery.split(" ").filter(w => w.length > 0);

      if (broadSearch) {
        words = words
          .filter(w => !/^\d+(\.\d+)?$/.test(w))
          .filter(w => !/^(Men's|Women's|Mens|Womens|Men|Women|Unisex|Boy's|Girl's|Kids|Youth|Adult|Adults|Toddler|Baby|Infant)$/i.test(w))
          .filter(w => !/^(Black|White|Red|Blue|Green|Navy|Gold|Silver|Gray|Grey|Pink|Purple|Orange|Brown|Beige|Tan|Cream|Ivory|Coral|Teal|Maroon|Burgundy|Olive|Charcoal|Yellow|Camo|Matte|Powder)$/i.test(w))
          .filter(w => !/^(Large|Small|Medium|XL|XXL|XS|XXXL|Long|Short|Tall|Full|Half|Mini|Micro|Mega|Giant|Big|Tiny|Jumbo)$/i.test(w))
          .filter(w => !/^(Wireless|Wired|Optical|Mechanical|Programmable|Buttons?|Sensor|Lighting|RGB|LED)$/i.test(w))
          .filter(w => !/^(Protein|Nutrition|Plan|Power|Elite|Core|Basic|Classic|Original|Standard|Limited|Edition|Special|Deluxe)$/i.test(w))
          .filter(w => !/^(Glossy|Shiny|Clear|Frosted|Tinted)$/i.test(w));
        if (words.length > 5) {
          words = words.slice(0, 5);
        }
      } else if (words.length > 6) {
        words = words.slice(0, 6);
      }

      cleanQuery = words.join(" ").slice(0, 80) || searchQuery.trim().slice(0, 80);

      console.log(`eBay sold search for: "${cleanQuery}" (original: "${searchQuery.slice(0, 50)}...")`);

      const params = new URLSearchParams({
        engine: "ebay_search",
        q: cleanQuery,
        filters: "sold_listings",
        api_key: apiKey,
      });

      const response = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`);
      const data = await response.json() as {
        organic_results?: {
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
        }[];
        search_information?: {
          total_results?: number;
        };
        error?: string;
      };

      if (data.error) {
        console.error("eBay sold search error:", data.error);
        return res.json({
          avgSoldPrice: 0,
          medianSoldPrice: 0,
          lowPrice: 0,
          highPrice: 0,
          totalSold: 0,
          avgSoldPerMonth: 0,
          items: [],
          noResults: true,
        });
      }

      const results = data.organic_results || [];
      console.log(`eBay sold search returned ${results.length} results`);

      if (results.length === 0) {
        return res.json({
          avgSoldPrice: 0,
          medianSoldPrice: 0,
          lowPrice: 0,
          highPrice: 0,
          totalSold: 0,
          avgSoldPerMonth: 0,
          items: [],
          noResults: true,
        });
      }

      const items = results
        .filter(r => r.extracted_price && r.extracted_price > 0)
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

      const prices = items.map(i => i.price);
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sortedPrices.length / 2);
      const medianSoldPrice = sortedPrices.length === 0
        ? 0
        : sortedPrices.length % 2 !== 0
          ? sortedPrices[mid]
          : (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;

      const avgSoldPrice = prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : 0;

      const soldDates = results
        .map(r => {
          if (r.extracted_sold_date) return new Date(r.extracted_sold_date + "T00:00:00Z").getTime();
          if (r.sold_date) {
            const cleaned = r.sold_date.replace(/^Sold\s+/i, "");
            const parsed = new Date(cleaned).getTime();
            if (!isNaN(parsed)) return parsed;
          }
          return NaN;
        })
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b);

      let avgSoldPerMonth = 0;
      if (soldDates.length >= 2) {
        const oldest = soldDates[0];
        const newest = soldDates[soldDates.length - 1];
        const monthsSpan = Math.max((newest - oldest) / (1000 * 60 * 60 * 24 * 30.44), 0.5);
        avgSoldPerMonth = Math.round(soldDates.length / monthsSpan);
      } else if (soldDates.length === 1) {
        avgSoldPerMonth = 1;
      }

      logEbaySearchEvent(deviceId, isPro, cleanQuery, !!broadSearch, items.length, avgSoldPrice);

      res.json({
        avgSoldPrice,
        medianSoldPrice,
        lowPrice: prices.length > 0 ? Math.min(...prices) : 0,
        highPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalSold: data.search_information?.total_results || items.length,
        avgSoldPerMonth,
        items,
      });
    } catch (error) {
      console.error("eBay sold search error:", error);
      res.status(500).json({ error: "Failed to search eBay sold data" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
