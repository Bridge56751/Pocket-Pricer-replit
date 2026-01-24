import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";

const SAMPLE_PRODUCTS = [
  {
    title: "Apple AirPods Pro 2nd Generation",
    imageUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400&h=400&fit=crop",
    currentPrice: 189.99,
    soldCount: 1247,
    category: "Electronics",
    condition: "New",
  },
  {
    title: "Nintendo Switch OLED Model",
    imageUrl: "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=400&h=400&fit=crop",
    currentPrice: 299.99,
    soldCount: 892,
    category: "Gaming",
    condition: "New",
  },
  {
    title: "Dyson V15 Detect Cordless Vacuum",
    imageUrl: "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400&h=400&fit=crop",
    currentPrice: 549.99,
    soldCount: 234,
    category: "Home",
    condition: "Refurbished",
  },
  {
    title: "LEGO Star Wars Millennium Falcon",
    imageUrl: "https://images.unsplash.com/photo-1472457897821-70d3819a0e24?w=400&h=400&fit=crop",
    currentPrice: 169.99,
    soldCount: 567,
    category: "Toys",
    condition: "New",
  },
  {
    title: "Sony WH-1000XM5 Headphones",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop",
    currentPrice: 348.00,
    soldCount: 445,
    category: "Electronics",
    condition: "New",
  },
  {
    title: "KitchenAid Stand Mixer Artisan Series",
    imageUrl: "https://images.unsplash.com/photo-1594385208974-2e75f8d7bb48?w=400&h=400&fit=crop",
    currentPrice: 379.99,
    soldCount: 312,
    category: "Kitchen",
    condition: "New",
  },
  {
    title: "Vintage Rolex Submariner Watch",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=400&fit=crop",
    currentPrice: 8999.00,
    soldCount: 23,
    category: "Watches",
    condition: "Pre-owned",
  },
  {
    title: "Canon EOS R5 Mirrorless Camera",
    imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop",
    currentPrice: 3299.00,
    soldCount: 156,
    category: "Photography",
    condition: "New",
  },
];

function generateProductFromQuery(query: string): any {
  const randomIndex = Math.floor(Math.random() * SAMPLE_PRODUCTS.length);
  const baseProduct = SAMPLE_PRODUCTS[randomIndex];
  
  const priceVariation = 0.8 + Math.random() * 0.4;
  const currentPrice = parseFloat((baseProduct.currentPrice * priceVariation).toFixed(2));
  
  const ebayFees = parseFloat((currentPrice * 0.13).toFixed(2));
  const avgShipping = parseFloat((5 + Math.random() * 10).toFixed(2));
  
  const estimatedCost = currentPrice * (0.3 + Math.random() * 0.4);
  const estimatedProfit = parseFloat((currentPrice - estimatedCost - ebayFees - avgShipping).toFixed(2));
  
  let title = baseProduct.title;
  if (query.length > 3 && !query.match(/^\d+$/)) {
    const words = query.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      title = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') + ' ' + baseProduct.category + ' Item';
    }
  }
  
  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    title,
    imageUrl: baseProduct.imageUrl,
    currentPrice,
    estimatedProfit,
    soldCount: Math.floor(baseProduct.soldCount * (0.5 + Math.random())),
    avgShipping,
    ebayFees,
    category: baseProduct.category,
    condition: baseProduct.condition,
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
      
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      
      const product = generateProductFromQuery(query);
      
      res.json(product);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });
  
  app.get("/api/trending", async (_req: Request, res: Response) => {
    try {
      const trending = SAMPLE_PRODUCTS.slice(0, 4).map((product, index) => ({
        id: `trending-${index}`,
        ...product,
        currentPrice: parseFloat((product.currentPrice * (0.9 + Math.random() * 0.2)).toFixed(2)),
        ebayFees: parseFloat((product.currentPrice * 0.13).toFixed(2)),
        avgShipping: parseFloat((5 + Math.random() * 5).toFixed(2)),
        estimatedProfit: parseFloat((product.currentPrice * (0.15 + Math.random() * 0.2)).toFixed(2)),
        searchedAt: new Date().toISOString(),
      }));
      
      res.json(trending);
    } catch (error) {
      console.error("Trending error:", error);
      res.status(500).json({ error: "Failed to fetch trending products" });
    }
  });
  
  const httpServer = createServer(app);

  return httpServer;
}
