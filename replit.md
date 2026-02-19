# Pocket Pricer

An Expo React Native mobile app that helps resellers discover product values by scanning items with Google Lens visual matching and searching across multiple platforms.

## Overview

This app allows resellers to:
- Scan products with camera using Google Lens visual matching (exact product identification)
- Search across Amazon, Walmart, Target, eBay, and more platforms
- View current prices from live multi-platform data
- Calculate estimated profit based on their costs (includes ~13% estimated fees)
- Save favorite products for later
- Track search and scan history

**No account required** - the app works immediately without registration. Subscriptions are tied to Apple ID / Google Play account via RevenueCat.

## Tech Stack

- **Frontend**: Expo React Native with TypeScript
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon-backed via Replit) - used only for guest scan tracking
- **Payments**: RevenueCat for iOS/Android in-app purchases ($8.99/month Pro subscription)
- **Product Identification**: Google Lens (via SerpAPI) for visual product matching
- **Product Data**: SerpAPI (Google Lens + Google Shopping for multi-platform results)
- **State Management**: TanStack React Query
- **Local Storage**: AsyncStorage for history, favorites, scan counts, and device ID
- **Navigation**: React Navigation (bottom tabs + native stack)
- **Styling**: Custom design tokens system with dark theme

## Environment Variables

- `SERPAPI_API_KEY` - Required for Google Lens + Shopping search (get from https://serpapi.com)
- `REVENUECAT_API_KEY` - RevenueCat public API key for in-app purchases
- `EXPO_PUBLIC_REVENUECAT_API_KEY` - Same key, exposed to frontend

## Project Structure

```
client/
├── App.tsx                    # App entry point with providers
├── components/                # Reusable UI components
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── EmptyState.tsx
│   ├── HeaderTitle.tsx
│   ├── ProfitBadge.tsx
│   ├── ProfitBreakdown.tsx
│   ├── ProductCard.tsx
│   ├── SearchBar.tsx
│   ├── SkeletonLoader.tsx
│   └── UpgradeModal.tsx       # Pro subscription upgrade modal
├── constants/
│   ├── design-tokens.ts       # Design system (colors, spacing, components)
│   └── theme.ts               # Legacy theme (kept for compatibility)
├── hooks/
│   ├── useDesignTokens.ts     # Hook for accessing design tokens
│   ├── useTheme.ts            # Theme hook
│   └── useScreenOptions.ts    # Navigation screen options
├── lib/
│   ├── query-client.ts        # React Query + API utilities
│   └── storage.ts             # AsyncStorage helpers (local-only)
├── navigation/
│   ├── RootStackNavigator.tsx # Main navigation
│   ├── MainTabNavigator.tsx   # Bottom tab bar
│   └── *StackNavigator.tsx    # Individual tab stacks
├── screens/
│   ├── OnboardingScreen.tsx   # First-launch tutorial (4 slides)
│   ├── ScanScreen.tsx         # Product search (home)
│   ├── CameraScanScreen.tsx   # AI camera scanning
│   ├── HistoryScreen.tsx      # Search history (local)
│   ├── FavoritesScreen.tsx    # Saved products (local)
│   ├── ProfileScreen.tsx      # Settings & subscription
│   └── ProductDetailScreen.tsx # Product profit breakdown
├── contexts/
│   ├── AuthContext.tsx        # Device ID and scan count management (no accounts)
│   └── RevenueCatContext.tsx  # In-app purchase management
└── types/
    └── product.ts             # TypeScript types

server/
├── index.ts                   # Express server setup
├── routes.ts                  # API endpoints (scan-with-lens only)
├── db.ts                      # PostgreSQL connection
└── templates/                 # Landing page
```

## Design System

The app uses a custom design tokens system (`client/constants/design-tokens.ts`) that provides:

- **Colors**: Primary (emerald green), danger, success, background variants
- **Typography**: Display, h1-h4, body, small, caption
- **Spacing**: xs to 5xl scale
- **Border Radius**: xs to full
- **Component Styles**: Pre-built styles for cards, buttons, badges, inputs

### Usage

```typescript
import { useDesignTokens } from "@/hooks/useDesignTokens";
import { colors } from "@/constants/design-tokens";

function MyComponent() {
  const { theme, isDarkMode } = useDesignTokens();
  
  return (
    <View style={{ backgroundColor: theme.colors.background }}>
      <View style={theme.components.card}>
        <TouchableOpacity style={theme.components.button.primary}>
          <Text style={{ color: colors.light.primaryForeground }}>Scan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
```

## API Endpoints

### Product Scan
- `POST /api/scan-with-lens` - Scan a product image using Google Lens
  - Body: `{ imageBase64: string }` (base64 encoded image)
  - Headers:
    - `X-Device-Id: <device-uuid>` - Unique device identifier
    - `X-Is-Pro: "true"|"false"` - Whether user has Pro subscription
  - Returns: Product identification with multi-platform pricing data
  - Free users limited to 5 lifetime scans (tracked by device ID in guest_scans table)

## Running the App

The app runs on two workflows:
- **Start Backend**: Express server on port 5000
- **Start Frontend**: Expo dev server on port 8081

Users can test on physical devices using Expo Go by scanning the QR code.

## Features

1. **AI Camera Scanning**: Take photos of products for AI-powered identification via Google Lens
2. **Multi-Platform Pricing**: See prices from Amazon, Walmart, Target, eBay, and more
3. **Profit Calculator**: Enter your cost to see net profit breakdown
4. **Fee Estimation**: Automatically calculates ~13% estimated selling fees
5. **Search History**: Track all previous searches (stored locally)
6. **Favorites**: Save profitable products for later (stored locally)
7. **Custom Settings**: Set default costs and target profit margins
8. **Subscription Tiers**: Free (5 lifetime scans) or Pro ($8.99/mo unlimited)

## Subscription Model

- **Free Tier**: 5 lifetime product scans (tracked per device)
- **Pro Tier**: $8.99/month for unlimited scans
- Users see an upgrade modal when they hit the free limit
- RevenueCat handles iOS/Android in-app purchases (tied to Apple ID / Google Play account)
- **No account required** - subscriptions managed entirely through app store accounts

## Database Schema

```sql
CREATE TABLE guest_scans (
  device_id VARCHAR(255) PRIMARY KEY,
  scan_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Recent Changes

- **Feb 2026**: Removed entire authentication system for Apple App Store compliance
  - Removed user accounts, signup/login, email verification, JWT tokens
  - Removed Resend email integration
  - App now works without any account creation (Apple guideline 5.1.1 compliance)
  - Subscriptions tied directly to Apple ID / Google Play account via RevenueCat
  - Scan limits tracked per device ID (AsyncStorage + guest_scans database table)
  - Replaced users table with guest_scans table
  - Simplified server to single scan endpoint
- **Feb 2026**: Removed Stripe integration (fully on RevenueCat now)
- **Feb 2026**: Added Google Lens visual matching for exact product identification
- **Feb 2026**: Multi-platform search (Amazon, Walmart, Target, eBay, Mercari, Poshmark)
- **Jan 2026**: Switched from Stripe to RevenueCat for iOS in-app purchases
- Integrated SerpAPI for multi-platform product data
- Added design tokens system for consistent theming
