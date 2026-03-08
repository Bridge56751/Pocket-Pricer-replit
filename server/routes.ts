import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { query } from "./db";

const FREE_LIFETIME_SEARCHES = 5;

async function uploadImageForLens(imageBase64: string): Promise<string | null> {
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const uploadServices = [
    async () => {
      const formData = new URLSearchParams();
      formData.append("key", "6d207e02198a847aa98d0a2a901485a5");
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
      formData.append("key", "b4e0e3a7e5e0c4b2d6a8f9c1e3b5d7a9");
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

      if (!isPro) {
        const guestResult = await query(
          "SELECT scan_count FROM guest_scans WHERE device_id = $1",
          [deviceId]
        );
        const guestCount = guestResult.rows[0]?.scan_count || 0;
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
        await query(
          `INSERT INTO guest_scans (device_id, scan_count, last_scan_at) 
           VALUES ($1, 1, CURRENT_TIMESTAMP)
           ON CONFLICT (device_id) 
           DO UPDATE SET scan_count = guest_scans.scan_count + 1, last_scan_at = CURRENT_TIMESTAMP`,
          [deviceId]
        );
      }

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

      if (!isPro) {
        const guestResult = await query(
          "SELECT scan_count FROM guest_scans WHERE device_id = $1",
          [deviceId]
        );
        const guestCount = guestResult.rows[0]?.scan_count || 0;
        if (guestCount >= FREE_LIFETIME_SEARCHES) {
          return res.status(403).json({
            error: "Free scan limit reached",
            limitReached: true,
          });
        }
      }

      const { searchQuery } = req.body;
      if (!searchQuery) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const apiKey = process.env.SEARCHAPI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Search API key not configured" });
      }

      console.log(`eBay sold search for: "${searchQuery}"`);

      const params = new URLSearchParams({
        engine: "ebay_search",
        q: searchQuery,
        show_only: "sold_items",
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
        }[];
        search_information?: {
          total_results?: number;
        };
        error?: string;
      };

      if (data.error) {
        console.error("eBay sold search error:", data.error);
        return res.status(500).json({ error: "eBay search failed" });
      }

      const results = data.organic_results || [];
      console.log(`eBay sold search returned ${results.length} results`);

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

      res.json({
        avgSoldPrice,
        medianSoldPrice,
        lowPrice: prices.length > 0 ? Math.min(...prices) : 0,
        highPrice: prices.length > 0 ? Math.max(...prices) : 0,
        totalSold: data.search_information?.total_results || items.length,
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
