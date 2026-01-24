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
  };
  shipping?: string;
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
  error?: string;
}

function calculateProfit(price: number): {
  ebayFees: number;
  avgShipping: number;
  estimatedProfit: number;
} {
  const ebayFees = parseFloat((price * 0.13).toFixed(2));
  const avgShipping = 8.50;
  const estimatedCost = price * 0.5;
  const estimatedProfit = parseFloat((price - estimatedCost - ebayFees - avgShipping).toFixed(2));
  
  return { ebayFees, avgShipping, estimatedProfit };
}

function transformEbayResult(result: EbayResult, index: number): any {
  const price = result.price?.extracted || 0;
  const { ebayFees, avgShipping, estimatedProfit } = calculateProfit(price);
  
  return {
    id: `ebay-${Date.now()}-${index}`,
    title: result.title || "Unknown Product",
    imageUrl: result.thumbnail || "https://via.placeholder.com/400",
    currentPrice: price,
    estimatedProfit,
    soldCount: result.sold || Math.floor(Math.random() * 100) + 10,
    avgShipping,
    ebayFees,
    category: "eBay Listing",
    condition: result.condition || "Not specified",
    link: result.link || "",
    seller: result.seller?.name || "Unknown Seller",
    sellerRating: result.seller?.rating || 0,
    searchedAt: new Date().toISOString(),
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
        _ipg: 20,
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

      const topResult = results[0];
      const product = transformEbayResult(topResult, 0);
      
      res.json(product);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/search/all", async (req: Request, res: Response) => {
    try {
      const { query, page = 1 } = req.body;
      
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
        _pgn: page,
        _ipg: 20,
        api_key: apiKey,
      }) as SerpApiResponse;

      if (response.error) {
        console.error("SerpAPI error:", response.error);
        return res.status(500).json({ error: "Search failed" });
      }

      const results = response.organic_results || [];
      const products = results.map((result, index) => transformEbayResult(result, index));
      
      res.json({ products, total: results.length });
    } catch (error) {
      console.error("Search error:", error);
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
        _fsrp: "Sold",
        _ipg: 8,
        api_key: apiKey,
      }) as SerpApiResponse;

      const results = response.organic_results || [];
      const products = results.map((result, index) => transformEbayResult(result, index));
      
      res.json(products);
    } catch (error) {
      console.error("Trending error:", error);
      res.status(500).json({ error: "Failed to fetch trending products" });
    }
  });
  
  const httpServer = createServer(app);

  return httpServer;
}
