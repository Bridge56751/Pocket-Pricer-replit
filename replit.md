# Pocket Pricer

## Overview

Pocket Pricer is an Expo React Native mobile application designed for resellers. It facilitates product value discovery by allowing users to scan items using Google Lens for visual matching and then search for prices across multiple e-commerce platforms like Amazon, Walmart, Target, and eBay. The app aims to streamline the reselling process by providing real-time pricing data, profit calculation tools, and historical tracking without requiring user accounts.

**Key Capabilities:**
- **Product Identification:** Utilizes Google Lens for exact product identification via camera scans.
- **Multi-Platform Price Comparison:** Gathers current prices from major online retailers.
- **Profit Calculation:** Estimates profit margins based on user-input costs and automatically calculated selling fees (~13%).
- **Historical Tracking:** Saves favorite products and maintains a search/scan history locally.
- **No Account Required:** Operates without user registration, with subscriptions managed via Apple ID / Google Play accounts.

The business vision is to empower resellers with immediate, comprehensive market data, enhancing their efficiency and profitability.

## User Preferences

- I prefer clear and concise communication.
- I appreciate detailed explanations when new features or complex logic are introduced.
- I expect iterative development with frequent, small updates rather than large, infrequent ones.
- Please ask for confirmation before making any significant architectural changes or adding new external dependencies.
- Ensure the application's core functionality remains stable throughout development.
- I prefer to be informed about any potential performance impacts of new features.

## System Architecture

The application is built with a client-server architecture. The frontend is an Expo React Native application using TypeScript, while the backend is an Express.js server also written in TypeScript. Supabase PostgreSQL serves as the primary database for guest scan tracking and analytics.

**UI/UX Decisions:**
- **Design System:** A custom design tokens system (`client/constants/design-tokens.ts`) is implemented for consistent styling, including colors (primary emerald green), typography, spacing, border radii, and component styles. This system supports a dark theme.
- **User Flow:** Features an onboarding screen for first-time users. The main navigation uses bottom tabs and native stacks.
- **Subscription UI:** A dismissible paywall screen appears after the 3rd free scan, offering a 3-day free trial for the Pro subscription.
- **Loading States:** Polished scan loading overlay with multi-step progress indicators ("Uploading image...", "Matching product...", "Finding best prices...") and animations.

**Technical Implementations & Feature Specifications:**
- **State Management:** TanStack React Query handles data fetching and caching.
- **Local Storage:** AsyncStorage is used for storing history, favorites, scan counts, and device IDs client-side.
- **Navigation:** React Navigation is used for managing app navigation.
- **Product Scanning:**
    - The `POST /api/scan-with-lens` endpoint processes base64 encoded images to identify products using Google Lens via SearchAPI.io.
    - Free users are limited to 3 lifetime scans, tracked by device ID in the `guest_scans` table.
- **eBay Sold Search:**
    - The `POST /api/ebay-sold-search` endpoint fetches eBay sold item data using SearchAPI.io, providing average, median, high, and low sold prices, total sold count, and individual listing details.
    - Includes a "Buy Score" (0-100) based on profit potential and demand (avgSoldPerMonth).
    - Features advanced query cleaning and broad search fallbacks if initial specific searches yield no results.
- **Rate Limiting:** Per-device rate limiting (20 requests/minute) is implemented on API endpoints using an in-memory sliding window.
- **Subscription Model:** Supports a Free Tier (3 scans) and Pro Tier with two plan options: Weekly ($2.99/week) and Monthly ($8.99/month), both with a 3-day free trial. Weekly is pre-selected by default. Monthly shows a "Best Value" badge. Both PaywallScreen and UpgradeModal display a plan selector when multiple packages are available from RevenueCat; falls back to single plan display when only one package exists. Subscriptions are managed via RevenueCat, linking directly to Apple ID / Google Play accounts.
- **Analytics:** Server-side analytics are logged to an external Supabase database, tracking device activity, scan events, and eBay search events.
- **Monetization:** Uses RevenueCat for in-app purchases.
- **App Store Review Prompt:** Triggers after the 5th successful scan using `expo-store-review`.

## External Dependencies

- **Product Identification & Data:**
    - **SearchAPI.io:** Used for Google Lens visual matching and multi-platform product data retrieval (Amazon, Walmart, Target, eBay), including eBay sold item data.
- **Database:**
    - **Supabase (PostgreSQL):** Utilized for guest scan tracking (`guest_scans` table) and server-side analytics (tables like `devices`, `scan_events`, `ebay_search_events`).
- **Payments & Subscriptions:**
    - **RevenueCat:** Manages iOS/Android in-app purchases and subscription logic.
- **Analytics & Tracking:**
    - **Firebase Analytics:** Integrated for app usage tracking (e.g., `app_open` events).
    - **Facebook SDK (react-native-fbsdk-next):** For Meta Ads tracking, including App Tracking Transparency prompt.
- **Image Hosting:**
    - **freeimage.host / imgbb:** Used for temporary image storage during the scanning process (API keys configured via environment variables).
- **Other:**
    - **Expo:** The underlying framework for the React Native application.
    - **TanStack React Query:** For data fetching and state management.
    - **React Navigation:** For routing and navigation within the app.

## Recent Changes

- **Mar 2026**: Paywall & onboarding flow redesign
  - Free scan limit reduced from 5 to 1
  - New full-screen non-dismissible PaywallScreen (`client/screens/PaywallScreen.tsx`) with "Start 3-Day Free Trial" CTA
  - Camera auto-opens for first-time users (0 scans) after onboarding
  - After first scan, PaywallScreen blocks further use until subscription
  - Onboarding badge changed from "5 free scans to start" to "Try free for 3 days"
  - UpgradeModal removed from ScanScreen (kept for ProfileScreen)
  - PaywallScreen added to RootStackNavigator with `gestureEnabled: false`
  - Server-side scan limit NOT changed (still 5) — frontend enforces 1-scan limit
- **Mar 2026**: Weekly plan option added
  - PaywallScreen and UpgradeModal now support two plan options: Weekly ($2.99/week) and Monthly ($8.99/month)
  - Weekly plan pre-selected by default; Monthly shows "Best Value" badge
  - Plan selector with radio-style selection UI; legal disclosure and CTA dynamically reflect selected plan
  - Graceful fallback: shows single plan card when only one RevenueCat package exists
  - Requires weekly product to be created in App Store Connect, Google Play Console, and RevenueCat dashboard