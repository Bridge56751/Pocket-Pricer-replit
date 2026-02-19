import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getJson } from "serpapi";
import { query } from "./db";

const FREE_LIFETIME_SEARCHES = 5;

async function uploadImageForLens(imageBase64: string): Promise<string | null> {
  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    
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
    if (data.status_code === 200 && data.image?.url) {
      return data.image.url;
    }
    console.error("Image upload failed:", data);
    return null;
  } catch (error) {
    console.error("Image upload error:", error);
    return null;
  }
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

interface GoogleLensResponse {
  visual_matches?: GoogleLensProduct[];
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
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) {
      return { products: [], error: "SerpAPI key not configured" };
    }

    const response = await getJson({
      engine: "google_lens",
      url: imageUrl,
      hl: "en",
      country: "us",
      no_cache: true,
      api_key: apiKey,
    }) as GoogleLensResponse;

    if (response.error) {
      console.error("Google Lens error:", response.error);
      return { products: [], error: response.error };
    }

    const products = response.visual_matches || [];
    const productName = response.knowledge_graph?.[0]?.title;
    
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

      if (!isPro && deviceId) {
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
      const productsWithPrices = allProducts.filter(p => 
        (p.price?.value || p.price?.extracted_value) && isReliableSource(p.source || '')
      );
      
      console.log(`After filtering: ${productsWithPrices.length} reliable products with prices (from ${allProducts.length})`);
      
      const prices = productsWithPrices
        .map(p => p.price?.extracted_value || p.price?.value || 0)
        .filter(p => p > 0);

      const avgListPrice = calculateMedian(prices);
      const bestBuyNow = prices.length > 0 ? Math.min(...prices) : 0;

      const listings = productsWithPrices.map((item, index) => ({
        id: `lens-${index}`,
        title: item.title || "Unknown Product",
        imageUrl: item.thumbnail || "",
        currentPrice: item.price?.extracted_value || item.price?.value || 0,
        condition: "New",
        shipping: 0,
        link: item.link || "",
        seller: item.source || "",
        platform: item.source || "Shop",
        rating: item.rating,
        reviews: item.reviews,
      }));

      const productName = lensResult.productName || "Scanned Product";

      if (!isPro && deviceId) {
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
  
  app.post("/api/deep-search", async (req: Request, res: Response) => {
    try {
      const { query: searchQuery } = req.body;

      if (!searchQuery) {
        return res.status(400).json({ error: "Query is required" });
      }

      const apiKey = process.env.SERPAPI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "SerpAPI key not configured" });
      }

      console.log(`Deep search for: ${searchQuery}`);

      const response = await getJson({
        engine: "google_shopping",
        q: searchQuery,
        hl: "en",
        gl: "us",
        num: 40,
        no_cache: true,
        api_key: apiKey,
      });

      const shoppingResults = (response as any).shopping_results || [];

      const listings = shoppingResults
        .filter((item: any) => isReliableSource(item.source || ''))
        .map((item: any, index: number) => ({
          id: `shopping-${index}`,
          title: item.title || "Unknown Product",
          imageUrl: item.thumbnail || "",
          currentPrice: item.extracted_price || item.price ? parseFloat(String(item.price).replace(/[^0-9.]/g, '')) : 0,
          condition: item.second_hand_condition || "New",
          shipping: 0,
          link: item.link || "",
          seller: item.source || "",
          platform: item.source || "Shop",
          rating: item.rating,
          reviews: item.reviews,
        }))
        .filter((item: any) => item.currentPrice > 0);

      const prices = listings.map((item: any) => item.currentPrice);
      const avgListPrice = calculateMedian(prices);
      const bestBuyNow = prices.length > 0 ? Math.min(...prices) : 0;

      console.log(`Deep search found ${listings.length} listings`);

      res.json({
        query: searchQuery,
        totalListings: listings.length,
        avgListPrice,
        avgSalePrice: null,
        soldCount: 0,
        bestBuyNow,
        topSalePrice: null,
        listings,
        usedLens: false,
      });
    } catch (error) {
      console.error("Deep search error:", error);
      res.status(500).json({ error: "Failed to perform deep search" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
