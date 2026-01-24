import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getJson } from "serpapi";

interface EbayResult {
  position?: number;
  title?: string;
  link?: string;
  price?: {
    raw?: string;
    extracted?: number;
    from?: {
      raw?: string;
      extracted?: number;
    };
  };
  shipping?: string | number | { raw?: string; value?: number };
  thumbnail?: string;
  condition?: string;
  seller?: {
    name?: string;
    rating?: number;
    reviews?: number;
  };
  sold?: number;
  watchers?: number;
  returns?: string;
}

interface SerpApiResponse {
  organic_results?: EbayResult[];
  search_metadata?: {
    status?: string;
  };
  search_information?: {
    total_results?: number;
  };
  error?: string;
}

function parseShippingCost(shipping?: unknown): number {
  if (!shipping) return 8.50;
  
  if (typeof shipping === "number") return shipping;
  
  if (typeof shipping === "string") {
    if (shipping.toLowerCase().includes("free")) return 0;
    const match = shipping.match(/\$?([\d.]+)/);
    return match ? parseFloat(match[1]) : 8.50;
  }
  
  if (typeof shipping === "object" && shipping !== null) {
    const shippingObj = shipping as { raw?: string; value?: number };
    if (typeof shippingObj.value === "number") return shippingObj.value;
    if (typeof shippingObj.raw === "string") {
      if (shippingObj.raw.toLowerCase().includes("free")) return 0;
      const match = shippingObj.raw.match(/\$?([\d.]+)/);
      return match ? parseFloat(match[1]) : 8.50;
    }
  }
  
  return 8.50;
}

function transformEbayResults(results: EbayResult[]): {
  listings: any[];
  avgListPrice: number;
  bestBuyNow: number;
  totalListings: number;
} {
  const listings = results.map((result, index) => {
    const price = result.price?.extracted || 0;
    const originalPrice = result.price?.from?.extracted;
    const shipping = parseShippingCost(result.shipping);

    return {
      id: `ebay-${Date.now()}-${index}`,
      title: result.title || "Unknown Product",
      imageUrl: result.thumbnail || "https://via.placeholder.com/400",
      currentPrice: price,
      originalPrice: originalPrice && originalPrice > price ? originalPrice : undefined,
      condition: result.condition || "Not specified",
      shipping,
      link: result.link || "",
      seller: result.seller?.name || "Unknown Seller",
    };
  });

  const prices = listings.map(l => l.currentPrice).filter(p => p > 0);
  const avgListPrice = prices.length > 0 
    ? prices.reduce((a, b) => a + b, 0) / prices.length 
    : 0;
  const bestBuyNow = prices.length > 0 ? Math.min(...prices) : 0;

  return {
    listings,
    avgListPrice,
    bestBuyNow,
    totalListings: listings.length,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/search", async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      const apiKey = process.env.SERPAPI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "SerpAPI key not configured" });
      }

      const response = await getJson({
        engine: "ebay",
        _nkw: query,
        ebay_domain: "ebay.com",
        _ipg: 25,
        api_key: apiKey,
      }) as SerpApiResponse;

      if (response.error) {
        console.error("SerpAPI error:", response.error);
        return res.status(500).json({ error: "Search failed" });
      }

      const results = response.organic_results || [];
      
      if (results.length === 0) {
        return res.status(404).json({ error: "No products found" });
      }

      const { listings, avgListPrice, bestBuyNow, totalListings } = transformEbayResults(results);

      const searchResults = {
        query,
        totalListings,
        avgListPrice,
        avgSalePrice: null,
        soldCount: 0,
        bestBuyNow,
        topSalePrice: null,
        listings,
      };
      
      res.json(searchResults);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/search/sold", async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Query is required" });
      }

      const apiKey = process.env.SERPAPI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "SerpAPI key not configured" });
      }

      const response = await getJson({
        engine: "ebay",
        _nkw: query,
        ebay_domain: "ebay.com",
        _fsrp: "Sold",
        _ipg: 25,
        api_key: apiKey,
      }) as SerpApiResponse;

      if (response.error) {
        console.error("SerpAPI error:", response.error);
        return res.status(500).json({ error: "Search failed" });
      }

      const results = response.organic_results || [];
      const { listings, avgListPrice, totalListings } = transformEbayResults(results);

      res.json({
        soldCount: totalListings,
        avgSalePrice: avgListPrice,
        topSalePrice: listings.length > 0 ? Math.max(...listings.map(l => l.currentPrice)) : null,
        listings,
      });
    } catch (error) {
      console.error("Sold search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/trending", async (_req: Request, res: Response) => {
    try {
      const apiKey = process.env.SERPAPI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "SerpAPI key not configured" });
      }

      const response = await getJson({
        engine: "ebay",
        _nkw: "trending electronics",
        ebay_domain: "ebay.com",
        _ipg: 8,
        api_key: apiKey,
      }) as SerpApiResponse;

      const results = response.organic_results || [];
      const { listings } = transformEbayResults(results);
      
      res.json(listings);
    } catch (error) {
      console.error("Trending error:", error);
      res.status(500).json({ error: "Failed to fetch trending products" });
    }
  });
  
  const httpServer = createServer(app);

  return httpServer;
}
