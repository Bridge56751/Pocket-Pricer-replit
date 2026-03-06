import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getJson } from "serpapi";
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

  for (const upload of uploadServices) {
    try {
      const url = await upload();
      if (url) return url;
    } catch (error) {
      console.error("Image upload attempt failed:", error);
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

      const productName = lensResult.productName
        || listings[0]?.title
        || "Scanned Product";

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
  
  app.post("/api/ebay-sold", async (req: Request, res: Response) => {
    try {
      const { query } = req.body;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Product query is required" });
      }

      console.log(`Fetching eBay sold listings for: ${query}`);

      const searchQuery = encodeURIComponent(query);
      const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}&LH_Complete=1&LH_Sold=1&_sop=13&rt=nc`;

      const response = await fetch(ebayUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!response.ok) {
        console.error(`eBay fetch failed with status: ${response.status}`);
        return res.status(502).json({ error: "Failed to fetch eBay data" });
      }

      const html = await response.text();

      const soldItems: Array<{
        title: string;
        price: number;
        soldDate: string;
        url: string;
        imageUrl: string;
      }> = [];

      const resultsIdx = html.indexOf("srp-results");
      if (resultsIdx === -1) {
        console.log("eBay: Could not find results section");
        return res.json({ query, soldCount: 0, avgSoldPrice: 0, recentSales: [] });
      }

      const resultsHtml = html.substring(resultsIdx);
      const cards = resultsHtml.split(/(?=data-listingid=\d)/);

      for (let i = 1; i < cards.length; i++) {
        const card = cards[i];

        const idMatch = card.match(/data-listingid=(\d+)/);
        if (!idMatch) continue;

        const titleMatch = card.match(/alt="([^"]{10,200})"/i);
        const title = titleMatch ? titleMatch[1].trim() : "";

        if (!title || title.toLowerCase().includes("shop on ebay")) continue;

        const priceMatch = card.match(/\$[\d,.]+/);
        const priceValue = priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9.]/g, "")) : 0;

        if (!priceValue || priceValue <= 0) continue;

        const dateMatch = card.match(/Sold\s+([A-Za-z]+\s+\d{1,2},?\s*\d{0,4})/i);
        const soldDate = dateMatch ? dateMatch[1].trim() : "";

        const urlMatch = card.match(/href=(https:\/\/www\.ebay\.com\/itm\/\d+)/);
        const url = urlMatch ? urlMatch[1] : "";

        const imgMatch = card.match(/src=(https:\/\/i\.ebayimg\.com[^\s>"']+)/);
        const imageUrl = imgMatch ? imgMatch[1] : "";

        soldItems.push({ title, price: priceValue, soldDate, url, imageUrl });
      }

      const validItems = soldItems.slice(0, 20);
      const prices = validItems.map(item => item.price);
      const avgSoldPrice = prices.length > 0
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
        : 0;

      console.log(`eBay sold: found ${validItems.length} sold items for "${query}"`);

      res.json({
        query,
        soldCount: validItems.length,
        avgSoldPrice: Math.round(avgSoldPrice * 100) / 100,
        recentSales: validItems,
      });
    } catch (error) {
      console.error("eBay sold fetch error:", error);
      res.status(500).json({ error: "Failed to fetch sales data" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
