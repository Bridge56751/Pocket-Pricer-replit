import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getJson } from "serpapi";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

const JWT_SECRET = process.env.SESSION_SECRET || "price-it-secret-key";
const FREE_LIFETIME_SEARCHES = 5;

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

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

async function getUserFromToken(req: Request): Promise<any | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    const result = await query("SELECT * FROM users WHERE id = $1", [decoded.userId]);
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

async function canUserSearch(user: any): Promise<{ allowed: boolean; remaining: number }> {
  if (!user) return { allowed: false, remaining: 0 };
  
  if (user.subscription_status === "active") {
    return { allowed: true, remaining: -1 };
  }
  
  const totalSearches = user.total_searches || 0;
  const remaining = FREE_LIFETIME_SEARCHES - totalSearches;
  return { allowed: remaining > 0, remaining };
}

async function incrementSearchCount(userId: string): Promise<void> {
  await query(
    "UPDATE users SET total_searches = COALESCE(total_searches, 0) + 1 WHERE id = $1",
    [userId]
  );
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const existing = await query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
        [userId, email.toLowerCase(), passwordHash]
      );
      
      const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
      
      res.json({ 
        token, 
        user: { 
          id: userId, 
          email: email.toLowerCase(),
          subscriptionStatus: "free",
          searchesRemaining: FREE_LIFETIME_SEARCHES,
        }
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      const user = result.rows[0];
      
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      const { allowed, remaining } = await canUserSearch(user);
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          email: user.email,
          subscriptionStatus: user.subscription_status,
          searchesRemaining: user.subscription_status === "active" ? -1 : remaining,
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/social", async (req: Request, res: Response) => {
    try {
      const { provider, email, name, googleId, appleId } = req.body;
      
      if (!provider || (!googleId && !appleId)) {
        return res.status(400).json({ error: "Invalid social login data" });
      }
      
      const providerId = provider === "google" ? googleId : appleId;
      const providerColumn = provider === "google" ? "google_id" : "apple_id";
      
      let result = await query(`SELECT * FROM users WHERE ${providerColumn} = $1`, [providerId]);
      let user = result.rows[0];
      
      if (!user && email) {
        result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
        user = result.rows[0];
        
        if (user) {
          await query(`UPDATE users SET ${providerColumn} = $1 WHERE id = $2`, [providerId, user.id]);
          user[providerColumn] = providerId;
        }
      }
      
      if (!user) {
        const userEmail = email || `${provider}_${providerId}@priceit.app`;
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const randomPassword = Math.random().toString(36).slice(-16);
        const passwordHash = await bcrypt.hash(randomPassword, 10);
        
        await query(
          `INSERT INTO users (id, email, password_hash, ${providerColumn}) VALUES ($1, $2, $3, $4)`,
          [userId, userEmail.toLowerCase(), passwordHash, providerId]
        );
        
        user = { 
          id: userId, 
          email: userEmail.toLowerCase(), 
          subscription_status: "free",
          total_searches: 0,
        };
      }
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      const { remaining } = await canUserSearch(user);
      
      res.json({ 
        token, 
        user: { 
          id: user.id, 
          email: user.email,
          subscriptionStatus: user.subscription_status || "free",
          searchesRemaining: user.subscription_status === "active" ? -1 : remaining,
        }
      });
    } catch (error) {
      console.error("Social login error:", error);
      res.status(500).json({ error: "Social login failed" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { remaining } = await canUserSearch(user);
      
      res.json({ 
        user: { 
          id: user.id, 
          email: user.email,
          subscriptionStatus: user.subscription_status,
          searchesRemaining: user.subscription_status === "active" ? -1 : remaining,
        }
      });
    } catch (error) {
      console.error("Auth check error:", error);
      res.status(500).json({ error: "Auth check failed" });
    }
  });

  app.get("/api/search-status", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { allowed, remaining } = await canUserSearch(user);
      
      res.json({ 
        canSearch: allowed,
        searchesRemaining: user.subscription_status === "active" ? -1 : remaining,
        isSubscribed: user.subscription_status === "active",
        freeLifetimeSearches: FREE_LIFETIME_SEARCHES,
      });
    } catch (error) {
      console.error("Search status error:", error);
      res.status(500).json({ error: "Failed to get search status" });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("Stripe key error:", error);
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  app.post("/api/create-checkout-session", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [customerId, user.id]);
      }
      
      const prices = await stripe.prices.list({ 
        active: true, 
        limit: 10,
        expand: ['data.product']
      });
      
      const priceItPrice = prices.data.find(p => {
        const product = p.product as any;
        return product.name === 'Pocket Pricer Pro' && p.recurring?.interval === 'month';
      });
      
      if (!priceItPrice) {
        return res.status(404).json({ error: "Subscription price not found. Please run seed-products script." });
      }
      
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceItPrice.id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription-success`,
        cancel_url: `${baseUrl}/subscription-cancel`,
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/customer-portal", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (!user.stripe_customer_id) {
        return res.status(400).json({ error: "No subscription found" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      const baseUrl = req.headers.origin || `https://${req.headers.host}`;
      
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: baseUrl,
      });
      
      res.json({ url: session.url });
    } catch (error) {
      console.error("Customer portal error:", error);
      res.status(500).json({ error: "Failed to create customer portal session" });
    }
  });

  app.post("/api/subscription/check", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (!user.stripe_customer_id) {
        return res.json({ status: "free" });
      }
      
      const stripe = await getUncachableStripeClient();
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: 'active',
        limit: 1,
      });
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        await query(
          "UPDATE users SET subscription_status = 'active', stripe_subscription_id = $1 WHERE id = $2",
          [subscription.id, user.id]
        );
        return res.json({ status: "active", subscriptionId: subscription.id });
      }
      
      await query("UPDATE users SET subscription_status = 'free' WHERE id = $1", [user.id]);
      return res.json({ status: "free" });
    } catch (error) {
      console.error("Subscription check error:", error);
      res.status(500).json({ error: "Failed to check subscription" });
    }
  });

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

  app.post("/api/analyze-image", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { allowed, remaining } = await canUserSearch(user);
      if (!allowed) {
        return res.status(403).json({ 
          error: "Daily scan limit reached", 
          limitReached: true,
          searchesRemaining: 0,
        });
      }
      
      const { imageBase64, images } = req.body;
      
      const imageList: string[] = images || (imageBase64 ? [imageBase64] : []);
      
      if (imageList.length === 0) {
        return res.status(400).json({ error: "Image data is required" });
      }

      const imageParts = imageList.map((img: string) => ({
        inlineData: {
          mimeType: "image/jpeg",
          data: img.replace(/^data:image\/\w+;base64,/, ""),
        },
      }));

      const promptText = imageList.length > 1
        ? `These ${imageList.length} photos show the SAME product from different angles. Analyze all photos together to accurately identify this single product for eBay reselling. Use details from all angles to get the most accurate identification.

Return ONLY a JSON object with this exact format (no markdown, no code blocks):
{"productName": "brief product name for eBay search", "brand": "brand name if visible", "model": "model number if visible", "condition": "estimated condition", "category": "product category", "description": "brief description based on all angles"}

Be specific but concise. Focus on searchable terms that would work well on eBay. If you cannot identify the product, return:
{"productName": null, "error": "Could not identify product"}`
        : `Identify this product for eBay reselling. Return ONLY a JSON object with this exact format (no markdown, no code blocks):
{"productName": "brief product name for eBay search", "brand": "brand name if visible", "model": "model number if visible", "condition": "estimated condition", "category": "product category"}

Be specific but concise. Focus on searchable terms that would work well on eBay. If you cannot identify the product, return:
{"productName": null, "error": "Could not identify product"}`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              ...imageParts,
              { text: promptText },
            ],
          },
        ],
      });

      const text = response.text || "";
      
      try {
        const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();
        const productInfo = JSON.parse(cleanedText);
        
        await incrementSearchCount(user.id);
        
        res.json(productInfo);
      } catch (parseError) {
        console.error("Failed to parse AI response:", text);
        res.json({ productName: text.substring(0, 100), raw: true });
      }
    } catch (error) {
      console.error("Image analysis error:", error);
      res.status(500).json({ error: "Failed to analyze image" });
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

  // Save scan to history
  app.post("/api/history", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = authHeader.split(" ")[1];
      let decoded: { userId: string };
      try {
        decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const { productName, queryUsed, avgPrice, bestPrice, totalListings, thumbnailUrl } = req.body;

      if (!productName) {
        return res.status(400).json({ error: "Product name is required" });
      }

      // Check how many scans user has, delete oldest if more than 15
      const countResult = await query(
        "SELECT COUNT(*) as count FROM scan_history WHERE user_id = $1",
        [decoded.userId]
      );
      
      const currentCount = parseInt(countResult.rows[0].count);
      
      if (currentCount >= 15) {
        // Delete oldest scans to make room (keep only 14, so new one makes 15)
        await query(
          `DELETE FROM scan_history WHERE id IN (
            SELECT id FROM scan_history WHERE user_id = $1 
            ORDER BY scanned_at ASC 
            LIMIT $2
          )`,
          [decoded.userId, currentCount - 14]
        );
      }

      // Insert new scan
      const result = await query(
        `INSERT INTO scan_history (user_id, product_name, query_used, avg_price, best_price, total_listings, thumbnail_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [decoded.userId, productName, queryUsed || productName, avgPrice, bestPrice, totalListings, thumbnailUrl]
      );

      res.json({ success: true, scan: result.rows[0] });
    } catch (error) {
      console.error("Save scan error:", error);
      res.status(500).json({ error: "Failed to save scan" });
    }
  });

  // Get user's scan history
  app.get("/api/history", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = authHeader.split(" ")[1];
      let decoded: { userId: string };
      try {
        decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const result = await query(
        `SELECT * FROM scan_history WHERE user_id = $1 ORDER BY scanned_at DESC LIMIT 15`,
        [decoded.userId]
      );

      res.json({ scans: result.rows });
    } catch (error) {
      console.error("Get history error:", error);
      res.status(500).json({ error: "Failed to get history" });
    }
  });

  // Delete a scan from history
  app.delete("/api/history/:id", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const token = authHeader.split(" ")[1];
      let decoded: { userId: string };
      try {
        decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const { id } = req.params;
      
      await query(
        "DELETE FROM scan_history WHERE id = $1 AND user_id = $2",
        [id, decoded.userId]
      );

      res.json({ success: true });
    } catch (error) {
      console.error("Delete scan error:", error);
      res.status(500).json({ error: "Failed to delete scan" });
    }
  });
  
  const httpServer = createServer(app);

  return httpServer;
}
