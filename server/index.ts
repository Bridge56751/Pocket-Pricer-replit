import "./env-loader";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { ensureEbaySearchEventsSchema } from "./supabase";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

// P1-6: don't leak the framework / version in response headers.
app.disable("x-powered-by");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// P1-6: standard security headers via helmet.
//
// CSP is tuned for the landing-page template (server/templates/landing-page.html)
// which inlines styles + scripts and pulls qr-code-styling from unpkg.com.
// Without these allowances, helmet's strict default CSP would break the page.
// The /api/* surface doesn't need CSP — it returns JSON, not HTML — so the
// permissive parts only affect the public landing/legal pages.
//
// SECURITY_REVIEW.md P2-13 flags the unpkg.com script as needing SRI; that's
// a separate follow-up. For now we at least scope CSP so the script can't be
// substituted from anywhere else.
function setupSecurityHeaders(app: express.Application) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:"],
          fontSrc: ["'self'", "data:", "https:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // We're not iframed by anyone we trust; disabling COEP avoids breaking
      // the landing page's cross-origin script load.
      crossOriginEmbedderPolicy: false,
    }),
  );
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // Replit-managed origins (production + Replit's dev tunnel).
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    // P1-6: explicit production origins so the allowlist works even if the
    // Replit env vars are missing for some reason.
    origins.add("https://pocketpricerapp.com");
    origins.add("https://pocket-pricer.replit.app");
    origins.add("https://pocket-pricer.com"); // marketing site

    const origin = req.header("origin");

    // P1-6: only reflect localhost origins in non-production. In prod, a
    // localhost origin is either an attacker probing or a misconfigured
    // user-side tool — never a legitimate caller of pocketpricerapp.com.
    const isLocalhost =
      process.env.NODE_ENV !== "production" &&
      (origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:"));

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      // P1-6: dropped X-Is-Pro from the allow-list — it's a client-trusted
      // claim that gets removed entirely in the P0-1 fix. Until then, don't
      // advertise it as a supported header.
      res.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Device-Id, X-Timezone-Offset",
      );
      // P1-6: dropped Access-Control-Allow-Credentials. The API doesn't use
      // cookies (everything's header-based), and combining credentials with
      // origin reflection is the primary CSRF-amplification footgun.
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const privacyPolicyPath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "privacy-policy.html",
  );
  const termsOfServicePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "terms-of-service.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const privacyPolicyTemplate = fs.readFileSync(privacyPolicyPath, "utf-8");
  const termsOfServiceTemplate = fs.readFileSync(termsOfServicePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (
      req.path !== "/" &&
      req.path !== "/manifest" &&
      req.path !== "/privacy" &&
      req.path !== "/terms"
    ) {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/privacy") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(privacyPolicyTemplate);
    }

    if (req.path === "/terms") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(termsOfServiceTemplate);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  setupSecurityHeaders(app);
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  // Fire-and-forget startup migration (non-blocking) — adds error_reason column
  // to ebay_search_events if missing. Idempotent.
  ensureEbaySearchEventsSchema().catch((err) => {
    console.error("ensureEbaySearchEventsSchema unhandled:", err?.message);
  });

  // Behind the Replit deployment edge (a reverse proxy), the proxy keeps
  // persistent keep-alive connections open to this origin and reuses them for
  // subsequent requests. Node's default server.keepAliveTimeout is only 5s, so
  // the proxy can dispatch a request (e.g. a scan upload) onto a socket that
  // Node is simultaneously closing. The body then never lands and Express logs
  // "BadRequestError: request aborted (received: 0)" — which is exactly the
  // production scan failure. Keep our keep-alive window comfortably above the
  // proxy's idle timeout, and headersTimeout strictly above keepAliveTimeout
  // (a Node requirement, else headers can be cut off mid-stream).
  server.keepAliveTimeout = 75_000;
  server.headersTimeout = 80_000;

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
