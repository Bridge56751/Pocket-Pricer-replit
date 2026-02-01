import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { getJson } from "serpapi";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sendVerificationEmail, sendPasswordResetEmail, sendSubscriptionThankYouEmail } from "./emailClient";

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const JWT_SECRET = process.env.SESSION_SECRET || "price-it-secret-key";
const FREE_LIFETIME_SEARCHES = 5;

// Emails that get Pro status for free (add emails or domain patterns)
const FREE_PRO_EMAILS: string[] = [
  "presslabrie22@gmail.com",
];

function isFreePro(email: string): boolean {
  const lowerEmail = email.toLowerCase();
  return FREE_PRO_EMAILS.some(pattern => {
    if (pattern.startsWith("@")) {
      // Domain pattern
      return lowerEmail.endsWith(pattern.toLowerCase());
    }
    // Exact email match
    return lowerEmail === pattern.toLowerCase();
  });
}

// Upload image to temporary hosting for Google Lens (uses freeimage.host API)
async function uploadImageForLens(imageBase64: string): Promise<string | null> {
  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    
    const formData = new URLSearchParams();
    formData.append("key", "6d207e02198a847aa98d0a2a901485a5"); // Free public API key
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

// Google Lens API response interfaces
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

// Search using Google Lens for exact product matching
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

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 100;

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
  const now = new Date();
  const minuteWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  const dayWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    const result = await query(
      `SELECT minute_count, day_count FROM rate_limits 
       WHERE user_id = $1 AND minute_window = $2 AND day_window = $3`,
      [userId, minuteWindow, dayWindow]
    );

    if (result.rows.length === 0) {
      await query(
        `INSERT INTO rate_limits (user_id, minute_window, day_window, minute_count, day_count) 
         VALUES ($1, $2, $3, 1, 1)
         ON CONFLICT (user_id, minute_window, day_window) 
         DO UPDATE SET minute_count = rate_limits.minute_count + 1, day_count = rate_limits.day_count + 1, updated_at = CURRENT_TIMESTAMP`,
        [userId, minuteWindow, dayWindow]
      );
      return { allowed: true };
    }

    const { minute_count, day_count } = result.rows[0];

    if (day_count >= RATE_LIMIT_PER_DAY) {
      return { allowed: false, message: "Daily limit of 100 requests reached. Try again tomorrow." };
    }

    if (minute_count >= RATE_LIMIT_PER_MINUTE) {
      return { allowed: false, message: "Rate limit exceeded. Please wait a minute before trying again." };
    }

    await query(
      `UPDATE rate_limits SET minute_count = minute_count + 1, day_count = day_count + 1, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1 AND minute_window = $2 AND day_window = $3`,
      [userId, minuteWindow, dayWindow]
    );

    return { allowed: true };
  } catch (error) {
    console.error("Rate limit check error:", error);
    return { allowed: true };
  }
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
      const { email, password, deviceId, deviceName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const existing = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      if (existing.rows.length > 0) {
        const existingUser = existing.rows[0];
        
        // If account was soft-deleted, restore it with existing search count
        if (existingUser.deleted_at) {
          console.log(`Restoring soft-deleted account for email signup, keeping search count: ${existingUser.total_searches}`);
          const passwordHash = await bcrypt.hash(password, 10);
          const verificationCode = generateVerificationCode();
          const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
          
          await query(
            `UPDATE users SET 
              deleted_at = NULL,
              password_hash = $1,
              email_verified = false,
              verification_code = $2,
              verification_code_expires = $3
            WHERE id = $4`,
            [passwordHash, verificationCode, verificationExpires, existingUser.id]
          );
          
          // Send verification email
          try {
            await sendVerificationEmail(email.toLowerCase(), verificationCode);
          } catch (emailError) {
            console.error("Failed to send verification email:", emailError);
          }
          
          return res.json({ 
            requiresVerification: true,
            email: email.toLowerCase(),
            message: "Please check your email for a verification code"
          });
        }
        
        return res.status(400).json({ error: "You already have an account. Please log in instead." });
      }
      
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const clientDeviceId = deviceId || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Check if email is on the free Pro list
      let subscriptionStatus = "free";
      let stripeCustomerId: string | null = null;
      let stripeSubscriptionId: string | null = null;
      
      if (isFreePro(email)) {
        subscriptionStatus = "active";
        console.log(`Granting free Pro access to whitelisted email: ${email}`);
      } else {
        // Check if there's an existing Stripe customer with an active subscription for this email
        try {
          const stripe = await getUncachableStripeClient();
          if (stripe) {
            // Search for existing customer by email
            const customers = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
            
            if (customers.data.length > 0) {
              const customer = customers.data[0];
              stripeCustomerId = customer.id;
              
              // Check for active subscriptions
              const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: "active",
                limit: 1,
              });
              
              if (subscriptions.data.length > 0) {
                stripeSubscriptionId = subscriptions.data[0].id;
                subscriptionStatus = "active";
                console.log(`Restoring Pro subscription for returning user: ${email}`);
              }
            }
          }
        } catch (stripeError) {
          console.error("Failed to check Stripe subscription:", stripeError);
          // Continue with free account if Stripe check fails
        }
      }
      
      // Generate email verification code
      const verificationCode = generateVerificationCode();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await query(
        `INSERT INTO users (id, email, password_hash, subscription_status, stripe_customer_id, stripe_subscription_id, email_verified, verification_code, verification_code_expires) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, email.toLowerCase(), passwordHash, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, false, verificationCode, verificationExpires]
      );
      
      // Send verification email
      try {
        await sendVerificationEmail(email.toLowerCase(), verificationCode);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Continue with signup even if email fails
      }
      
      res.json({ 
        requiresVerification: true,
        email: email.toLowerCase(),
        message: "Please check your email for a verification code"
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // Verify email with code
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { email, code, deviceId, deviceName } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: "Email and verification code required" });
      }
      
      const result = await query(
        "SELECT * FROM users WHERE email = $1 AND verification_code = $2",
        [email.toLowerCase(), code]
      );
      
      const user = result.rows[0];
      
      if (!user) {
        return res.status(400).json({ error: "Invalid verification code" });
      }
      
      if (new Date(user.verification_code_expires) < new Date()) {
        return res.status(400).json({ error: "Verification code expired. Please request a new one." });
      }
      
      // Mark email as verified
      await query(
        "UPDATE users SET email_verified = true, verification_code = NULL, verification_code_expires = NULL WHERE id = $1",
        [user.id]
      );
      
      // Create session and return token
      const clientDeviceId = deviceId || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const token = jwt.sign({ userId: user.id, deviceId: clientDeviceId }, JWT_SECRET, { expiresIn: "30d" });
      const tokenHash = await bcrypt.hash(token.slice(-20), 5);
      
      await query(
        `INSERT INTO user_sessions (user_id, device_id, device_name, token_hash) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, device_id) 
         DO UPDATE SET token_hash = $4, last_active = NOW()`,
        [user.id, clientDeviceId, deviceName || "Unknown Device", tokenHash]
      );
      
      res.json({ 
        token,
        deviceId: clientDeviceId,
        user: { 
          id: user.id, 
          email: user.email,
          subscriptionStatus: user.subscription_status,
          searchesRemaining: user.subscription_status === "active" ? -1 : FREE_LIFETIME_SEARCHES - (user.total_searches || 0),
        }
      });
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // Resend verification code
  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email required" });
      }
      
      const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      const user = result.rows[0];
      
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }
      
      if (user.email_verified) {
        return res.status(400).json({ error: "Email already verified" });
      }
      
      const verificationCode = generateVerificationCode();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await query(
        "UPDATE users SET verification_code = $1, verification_code_expires = $2 WHERE id = $3",
        [verificationCode, verificationExpires, user.id]
      );
      
      await sendVerificationEmail(email.toLowerCase(), verificationCode);
      
      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ error: "Failed to resend verification code" });
    }
  });

  // Password reset - request reset code
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      const user = result.rows[0];
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ success: true, message: "If an account exists with this email, a reset code has been sent" });
      }
      
      // Check if account is deleted
      if (user.deleted_at) {
        return res.json({ success: true, message: "If an account exists with this email, a reset code has been sent" });
      }
      
      // Generate reset code (expires in 1 hour)
      const resetCode = generateVerificationCode();
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000);
      
      await query(
        "UPDATE users SET verification_code = $1, verification_code_expires = $2 WHERE id = $3",
        [resetCode, resetExpires, user.id]
      );
      
      await sendPasswordResetEmail(email.toLowerCase(), resetCode);
      
      res.json({ success: true, message: "If an account exists with this email, a reset code has been sent" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Failed to send reset code" });
    }
  });

  // Password reset - verify code and set new password
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "Email, code, and new password are required" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }
      
      const result = await query(
        "SELECT * FROM users WHERE email = $1 AND verification_code = $2",
        [email.toLowerCase(), code]
      );
      const user = result.rows[0];
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }
      
      if (new Date(user.verification_code_expires) < new Date()) {
        return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
      }
      
      // Hash new password and update
      const passwordHash = await bcrypt.hash(newPassword, 10);
      
      await query(
        "UPDATE users SET password_hash = $1, verification_code = NULL, verification_code_expires = NULL WHERE id = $2",
        [passwordHash, user.id]
      );
      
      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password, deviceId, deviceName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
      const user = result.rows[0];
      
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Check if email is verified
      if (!user.email_verified) {
        return res.status(403).json({ 
          error: "Email not verified",
          requiresVerification: true,
          email: user.email,
          message: "Please verify your email before logging in"
        });
      }
      
      // Check device limit (2 devices per account)
      const MAX_DEVICES = 2;
      const clientDeviceId = deviceId || `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Check if this device is already registered
      const existingSession = await query(
        "SELECT id FROM user_sessions WHERE user_id = $1 AND device_id = $2",
        [user.id, clientDeviceId]
      );
      
      if (existingSession.rows.length === 0) {
        // New device - check if user is at device limit
        const sessionCount = await query(
          "SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1",
          [user.id]
        );
        
        if (parseInt(sessionCount.rows[0].count) >= MAX_DEVICES) {
          return res.status(403).json({ 
            error: "Device limit reached", 
            message: "You can only use 2 devices per account. Please log out from another device first.",
            deviceLimitReached: true
          });
        }
      }
      
      const token = jwt.sign({ userId: user.id, deviceId: clientDeviceId }, JWT_SECRET, { expiresIn: "30d" });
      const tokenHash = await bcrypt.hash(token.slice(-20), 5);
      
      // Upsert session (update if exists, insert if new)
      await query(
        `INSERT INTO user_sessions (user_id, device_id, device_name, token_hash, last_active) 
         VALUES ($1, $2, $3, $4, NOW()) 
         ON CONFLICT (user_id, device_id) 
         DO UPDATE SET token_hash = $4, last_active = NOW()`,
        [user.id, clientDeviceId, deviceName || "Unknown Device", tokenHash]
      );
      
      const { allowed, remaining } = await canUserSearch(user);
      
      res.json({ 
        token,
        deviceId: clientDeviceId,
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

  // Logout - removes device session
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { deviceId } = req.body;
      
      if (deviceId) {
        await query(
          "DELETE FROM user_sessions WHERE user_id = $1 AND device_id = $2",
          [user.id, deviceId]
        );
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Get active devices
  app.get("/api/auth/devices", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const result = await query(
        "SELECT device_id, device_name, last_active, created_at FROM user_sessions WHERE user_id = $1 ORDER BY last_active DESC",
        [user.id]
      );
      
      res.json({ devices: result.rows });
    } catch (error) {
      console.error("Get devices error:", error);
      res.status(500).json({ error: "Failed to get devices" });
    }
  });

  // Remove a specific device
  app.delete("/api/auth/devices/:deviceId", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { deviceId } = req.params;
      
      await query(
        "DELETE FROM user_sessions WHERE user_id = $1 AND device_id = $2",
        [user.id, deviceId]
      );
      
      res.json({ success: true, message: "Device removed successfully" });
    } catch (error) {
      console.error("Remove device error:", error);
      res.status(500).json({ error: "Failed to remove device" });
    }
  });

  // Delete user account (soft delete - preserves search count for abuse prevention)
  app.delete("/api/auth/account", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Keep the Stripe subscription active - user can restore it if they sign up again
      // Soft delete: mark as deleted but preserve the record to prevent free scan abuse

      // Delete user sessions
      await query("DELETE FROM user_sessions WHERE user_id = $1", [user.id]);

      // Soft delete: mark as deleted, clear password, but keep search count and social IDs
      await query(
        `UPDATE users SET 
          deleted_at = NOW(), 
          password_hash = 'DELETED',
          email_verified = false,
          verification_code = NULL,
          verification_code_expires = NULL
        WHERE id = $1`,
        [user.id]
      );

      res.json({ success: true, message: "Account deleted successfully" });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
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
      
      // Check for existing user by provider ID (including soft-deleted accounts)
      let result = await query(`SELECT * FROM users WHERE ${providerColumn} = $1`, [providerId]);
      let user = result.rows[0];
      
      if (!user && email) {
        // Check by email (including soft-deleted accounts)
        result = await query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
        user = result.rows[0];
        
        if (user) {
          await query(`UPDATE users SET ${providerColumn} = $1 WHERE id = $2`, [providerId, user.id]);
          user[providerColumn] = providerId;
        }
      }
      
      if (user) {
        // If account was soft-deleted, restore it but keep the search count
        if (user.deleted_at) {
          console.log(`Restoring soft-deleted social login account: ${user.id}, keeping search count: ${user.total_searches}`);
          await query(
            `UPDATE users SET deleted_at = NULL, email_verified = true WHERE id = $1`,
            [user.id]
          );
          user.deleted_at = null;
          user.email_verified = true;
        }
      } else {
        // Create new user only if no existing account found
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
      
      // Verify customer exists in Stripe, create new one if not
      if (customerId) {
        try {
          await stripe.customers.retrieve(customerId);
        } catch (err: any) {
          if (err.code === 'resource_missing') {
            console.log(`Customer ${customerId} not found in Stripe, creating new one`);
            customerId = null;
          } else {
            throw err;
          }
        }
      }
      
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
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceItPrice.id, quantity: 1 }],
        mode: 'subscription',
        success_url: `ebayprofit://subscription-success`,
        cancel_url: `ebayprofit://subscription-cancel`,
      });
      
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error?.message || error);
      console.error("Full error:", JSON.stringify(error, null, 2));
      res.status(500).json({ error: "Failed to create checkout session", details: error?.message });
    }
  });

  app.post("/api/stripe-webhook", async (req: Request, res: Response) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.log("Stripe webhook secret not configured, skipping signature verification");
    }

    let event;
    
    try {
      const stripe = await getUncachableStripeClient();
      
      if (webhookSecret) {
        const sig = req.headers["stripe-signature"] as string;
        // req.body is raw Buffer when using express.raw()
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;
          
          if (customerId && subscriptionId) {
            await query(
              "UPDATE users SET subscription_status = 'active', stripe_subscription_id = $1 WHERE stripe_customer_id = $2",
              [subscriptionId, customerId]
            );
            console.log(`Subscription activated for customer ${customerId}`);
            
            // Send thank you email
            try {
              const userResult = await query(
                "SELECT email FROM users WHERE stripe_customer_id = $1",
                [customerId]
              );
              if (userResult.rows.length > 0) {
                await sendSubscriptionThankYouEmail(userResult.rows[0].email);
                console.log(`Thank you email sent to ${userResult.rows[0].email}`);
              }
            } catch (emailError) {
              console.error("Failed to send thank you email:", emailError);
            }
          }
          break;
        }
        
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = subscription.customer as string;
          const status = subscription.status;
          
          const newStatus = status === "active" ? "active" : "free";
          await query(
            "UPDATE users SET subscription_status = $1 WHERE stripe_customer_id = $2",
            [newStatus, customerId]
          );
          console.log(`Subscription updated to ${newStatus} for customer ${customerId}`);
          break;
        }
        
        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customerId = subscription.customer as string;
          
          await query(
            "UPDATE users SET subscription_status = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1",
            [customerId]
          );
          console.log(`Subscription cancelled for customer ${customerId}`);
          break;
        }
        
        case "invoice.payment_failed": {
          const invoice = event.data.object;
          const customerId = invoice.customer as string;
          console.log(`Payment failed for customer ${customerId}`);
          break;
        }
        
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
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
        limit: 1,
      });
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0] as any;
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const periodEnd = subscription.current_period_end;
        
        if (isActive) {
          await query(
            "UPDATE users SET subscription_status = 'active', stripe_subscription_id = $1 WHERE id = $2",
            [subscription.id, user.id]
          );
          return res.json({ 
            status: "active", 
            subscriptionId: subscription.id,
            cancelAtPeriodEnd,
            periodEndDate: periodEnd ? new Date(periodEnd * 1000).toISOString() : null
          });
        }
      }
      
      await query("UPDATE users SET subscription_status = 'free' WHERE id = $1", [user.id]);
      return res.json({ status: "free" });
    } catch (error) {
      console.error("Subscription check error:", error);
      res.status(500).json({ error: "Failed to check subscription" });
    }
  });

  // RevenueCat subscription sync - called from mobile app to sync iOS/Android purchase status
  app.post("/api/subscription/sync", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { isPro, revenuecatUserId } = req.body;
      
      if (typeof isPro !== "boolean") {
        return res.status(400).json({ error: "isPro status required" });
      }
      
      const newStatus = isPro ? "active" : "free";
      
      // Update user subscription status based on RevenueCat
      await query(
        "UPDATE users SET subscription_status = $1, revenuecat_user_id = $2 WHERE id = $3",
        [newStatus, revenuecatUserId || null, user.id]
      );
      
      // Send thank you email on new subscription
      if (isPro && user.subscription_status !== "active") {
        try {
          await sendSubscriptionThankYouEmail(user.email);
        } catch (emailError) {
          console.error("Failed to send subscription thank you email:", emailError);
        }
      }
      
      return res.json({ 
        status: newStatus,
        synced: true
      });
    } catch (error) {
      console.error("Subscription sync error:", error);
      res.status(500).json({ error: "Failed to sync subscription" });
    }
  });

  app.post("/api/subscription/cancel", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      // First, try to find the active subscription from Stripe
      let subscriptionId = user.stripe_subscription_id;
      
      if (user.stripe_customer_id) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripe_customer_id,
            status: 'active',
            limit: 1,
          });
          
          if (subscriptions.data.length > 0) {
            subscriptionId = subscriptions.data[0].id;
            // Update stored subscription ID if different
            if (subscriptionId !== user.stripe_subscription_id) {
              await query(
                "UPDATE users SET stripe_subscription_id = $1 WHERE id = $2",
                [subscriptionId, user.id]
              );
            }
          }
        } catch (listError: any) {
          console.error("Error listing subscriptions:", listError?.message);
        }
      }
      
      if (!subscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }
      
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      }) as any;
      
      console.log("Subscription cancelled at period end:", subscription.id);
      
      let accessUntil = null;
      if (subscription.current_period_end) {
        const periodEndDate = new Date(subscription.current_period_end * 1000);
        accessUntil = periodEndDate.toISOString();
        console.log(`Subscription ${subscription.id} set to cancel at ${accessUntil}`);
      }
      
      res.json({ 
        success: true, 
        message: "Your subscription will be cancelled at the end of your billing period.",
        accessUntil
      });
    } catch (error: any) {
      console.error("Cancel subscription error:", error?.message || error);
      res.status(500).json({ error: "Failed to cancel subscription", details: error?.message });
    }
  });

  app.post("/api/subscription/reactivate", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const stripe = await getUncachableStripeClient();
      
      // Find the subscription from Stripe by customer ID
      let subscriptionId = user.stripe_subscription_id;
      
      if (user.stripe_customer_id) {
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripe_customer_id,
            limit: 1,
          });
          
          if (subscriptions.data.length > 0) {
            subscriptionId = subscriptions.data[0].id;
            if (subscriptionId !== user.stripe_subscription_id) {
              await query(
                "UPDATE users SET stripe_subscription_id = $1 WHERE id = $2",
                [subscriptionId, user.id]
              );
            }
          }
        } catch (listError: any) {
          console.error("Error listing subscriptions:", listError?.message);
        }
      }
      
      if (!subscriptionId) {
        return res.status(400).json({ error: "No subscription found" });
      }
      
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      
      console.log(`Subscription ${subscriptionId} reactivated`);
      
      res.json({ 
        success: true, 
        message: "Your subscription has been reactivated."
      });
    } catch (error: any) {
      console.error("Reactivate subscription error:", error?.message || error);
      res.status(500).json({ error: "Failed to reactivate subscription", details: error?.message });
    }
  });

  // Google Lens powered exact product search
  app.post("/api/scan-with-lens", async (req: Request, res: Response) => {
    try {
      const user = await getUserFromToken(req);
      
      if (user && user.subscriptionStatus !== "pro") {
        const rateLimit = await checkRateLimit(user.id);
        if (!rateLimit.allowed) {
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

      // Upload image temporarily for Google Lens
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

      // Filter out unreliable sources (knockoffs, fakes)
      const blockedSources = [
        'alibaba', 'aliexpress', 'temu', 'wish', 'dhgate', 'banggood',
        'tiktok', 'shein', 'made-in-china', 'lightinthebox', 'gearbest',
        'tomtop', 'miniinthebox', 'sammydress', 'rosegal', 'zaful'
      ];
      
      const isReliableSource = (source: string) => {
        const lowerSource = (source || '').toLowerCase();
        return !blockedSources.some(blocked => lowerSource.includes(blocked));
      };

      // Transform lens results to our format - filter out unreliable sources
      const allProducts = lensResult.products.slice(0, 60);
      const productsWithPrices = allProducts.filter(p => 
        (p.price?.value || p.price?.extracted_value) && isReliableSource(p.source || '')
      );
      
      console.log(`After filtering: ${productsWithPrices.length} reliable products with prices (from ${allProducts.length})`);
      
      // Use products with prices for pricing calculations
      const prices = productsWithPrices
        .map(p => p.price?.extracted_value || p.price?.value || 0)
        .filter(p => p > 0);

      const avgListPrice = calculateMedian(prices);
      const bestBuyNow = prices.length > 0 ? Math.min(...prices) : 0;

      // Only show products with prices
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

      // Use Google Lens knowledge graph name or generic fallback
      const productName = lensResult.productName || "Scanned Product";

      if (user) {
        await incrementSearchCount(user.id);
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

      const { productName, queryUsed, avgPrice, bestPrice, totalListings, thumbnailUrl, resultsJson } = req.body;

      if (!productName) {
        return res.status(400).json({ error: "Product name is required" });
      }

      // Check how many scans user has, delete oldest if more than 10
      const countResult = await query(
        "SELECT COUNT(*) as count FROM scan_history WHERE user_id = $1",
        [decoded.userId]
      );
      
      const currentCount = parseInt(countResult.rows[0].count);
      
      if (currentCount >= 10) {
        // Delete oldest scans to make room (keep only 9, so new one makes 10)
        await query(
          `DELETE FROM scan_history WHERE id IN (
            SELECT id FROM scan_history WHERE user_id = $1 
            ORDER BY scanned_at ASC 
            LIMIT $2
          )`,
          [decoded.userId, currentCount - 9]
        );
      }

      // Insert new scan with full results
      const result = await query(
        `INSERT INTO scan_history (user_id, product_name, query_used, avg_price, best_price, total_listings, thumbnail_url, results_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [decoded.userId, productName, queryUsed || productName, avgPrice, bestPrice, totalListings, thumbnailUrl, resultsJson ? JSON.stringify(resultsJson) : null]
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
        `SELECT * FROM scan_history WHERE user_id = $1 ORDER BY scanned_at DESC LIMIT 10`,
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
