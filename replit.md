# Pocket Pricer

## Overview

Pocket Pricer is an Expo React Native mobile application for resellers that identifies products via Google Lens scans and compares prices across major e-commerce platforms (Amazon, Walmart, Target, eBay). It provides real-time pricing, profit calculation, and historical tracking without requiring user accounts. The app aims to enhance reseller efficiency and profitability by delivering immediate, comprehensive market data.

**Key Capabilities:**
- **Product Identification:** Google Lens-powered scanning for product matching.
- **Multi-Platform Price Comparison:** Gathers prices from Amazon, Walmart, Target, and eBay.
- **Profit Calculation:** Estimates profit margins based on user input and automated selling fee calculation.
- **Historical Tracking:** Stores inventory items, search history, and scan history locally.
- **Inventory Tracking:** Manual flip tracking with purchase price, mark-sold flow, and live profit metrics (Spent / Sold / Profit).
- **No Account Required:** Operates without user registration, with subscriptions managed via platform app stores.

## User Preferences

- I prefer clear and concise communication.
- I appreciate detailed explanations when new features or complex logic are introduced.
- I expect iterative development with frequent, small updates rather than large, infrequent ones.
- Please ask for confirmation before making any significant architectural changes or adding new external dependencies.
- Ensure the application's core functionality remains stable throughout development.
- I prefer to be informed about any potential performance impacts of new features.

## System Architecture

The application employs a client-server architecture. The frontend is an Expo React Native application using TypeScript, while the backend is an Express.js server, also in TypeScript. Supabase PostgreSQL serves as the primary database for guest scan tracking and analytics.

**UI/UX Decisions:**
- **Design System:** Custom design tokens ensure consistent styling with an emerald green primary color scheme, locked to a light theme.
- **User Flow:** Includes an onboarding process for new users and bottom tab navigation (Inventory / Scan / Settings) with the Scan tab as a prominent emerald circular button in the middle. Tabs live inside a root native stack that also pushes CameraScan, SearchResults, History, and Paywall.
- **Subscription UI:** A dismissible paywall appears after a limited number of free scans, offering a 3-day free trial for the Pro subscription, with weekly and monthly plan options.
- **Loading States:** Features a multi-step progress overlay with animations during product scanning.

**Technical Implementations & Feature Specifications:**
- **State Management:** TanStack React Query manages data fetching and caching.
- **Local Storage:** AsyncStorage stores history, favorites, scan counts, and device IDs.
- **Inventory Persistence:** Inventory items are stored in Supabase (`inventory_items` table), keyed by anonymous device ID, so flips survive app reinstalls. CRUD via `/api/inventory/:deviceId` (GET/POST) and `/api/inventory/:deviceId/:itemId` (PATCH/DELETE). A one-time client migration pushes any pre-existing local AsyncStorage inventory to the cloud on first launch (`@ebay_profit/inventory_migrated_v1` flag); server-side `upsert` keeps the migration safe to retry on partial failure.
- **Navigation:** React Navigation handles in-app navigation.
- **Product Scanning:** `POST /api/scan-with-lens` uses SearchAPI.io (primary) with ScrapingDog (fallback) for Google Lens product identification from base64 images. Free users are limited to 3 lifetime scans.
- **eBay Sold Search:** `POST /api/ebay-sold-search` retrieves eBay sold item data, providing price statistics and a "Buy Score." AI-powered query cleaning (using Gemini 2.5 Flash via Replit AI Integrations) enhances search accuracy. Uses a **SerpAPI-first waterfall**: SerpAPI (18s timeout) is tried first; SearchAPI.io (12s timeout) is only invoked as a fallback when SerpAPI fails outright (timeout, HTTP error, fetch error) or returns zero usable priced results. SearchAPI is never called when SerpAPI succeeds — best case is 1 external call (~1-3s), worst case is 2 calls (~30s = 18s + 12s). On a strict-zero outcome where at least one provider responded successfully (i.e. real "no results" rather than an outage), the route auto-broadens via a second SerpAPI-first waterfall using a relaxed query (max 4 external calls per request, only on the strict-zero path). `serviceError: true` is only returned when both providers fail outright; one ok-empty + one failure is treated as `noResults: true`. SerpAPI's eBay engine response is normalized into the SearchAPI shape so a single parser handles both providers.
- **Rate Limiting:** In-memory sliding window rate limiting (20 requests/minute per device) is implemented on API endpoints.
- **Subscription Model:** Supports Free (3 scans) and Pro tiers (Weekly/Monthly with 3-day free trial), managed by RevenueCat.
- **Analytics:** Server-side analytics (device activity, scan events, eBay search) are logged to Supabase.
- **Monetization:** In-app purchases are handled by RevenueCat.
- **App Store Review:** Prompts users for reviews after the 5th successful scan.

## External Dependencies

- **Product Identification & Data:**
    - **SearchAPI.io:** Primary Google Lens visual matching provider (includes pricing data). Also handles multi-platform product data (Amazon, Walmart, Target, eBay), and eBay sold item data.
    - **ScrapingDog:** Fallback Google Lens provider (product identification without pricing). Used when SearchAPI.io is unavailable.
- **Database:**
    - **Supabase (PostgreSQL):** Used for guest scan tracking and server-side analytics.
- **Payments & Subscriptions:**
    - **RevenueCat:** Manages iOS/Android in-app purchases and subscription logic.
- **Analytics & Tracking:**
    - **Firebase Analytics:** App usage tracking.
    - **Facebook SDK (react-native-fbsdk-next):** Meta Ads tracking and App Tracking Transparency.
    - **AppsFlyer:** Mobile Measurement Partner (MMP) for attribution tracking.
- **Image Hosting:**
    - **freeimage.host / imgbb:** Temporary image storage for scan processing.
- **Other:**
    - **Expo:** React Native development framework.
    - **TanStack React Query:** Data fetching and state management.
    - **React Navigation:** In-app routing.
    - **Replit AI Integrations (Gemini 2.5 Flash):** For AI-powered eBay search query cleaning.