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

## Tech Stack

- **Frontend**: Expo React Native with TypeScript
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon-backed via Replit)
- **Authentication**: JWT tokens with bcrypt password hashing
- **Payments**: RevenueCat for iOS/Android in-app purchases ($4.99/month Pro subscription)
- **AI**: Google Lens for visual matching + Gemini for fallback identification + Google Cloud Vision for OCR
- **Product Data**: SerpAPI (Google Lens + Google Shopping for multi-platform results)
- **State Management**: TanStack React Query
- **Local Storage**: AsyncStorage for history, favorites, and auth tokens
- **Navigation**: React Navigation (bottom tabs + native stack)
- **Styling**: Custom design tokens system with dark theme

## Environment Variables

- `SERPAPI_API_KEY` - Required for eBay listing search (get from https://serpapi.com)
- `SESSION_SECRET` - Used for JWT token signing
- `REVENUECAT_API_KEY` - RevenueCat public API key for in-app purchases
- `EXPO_PUBLIC_REVENUECAT_API_KEY` - Same key, exposed to frontend
- `GOOGLE_CLOUD_VISION_API_KEY` - For OCR text extraction from product images

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
│   └── SkeletonLoader.tsx
├── constants/
│   ├── design-tokens.ts       # Design system (colors, spacing, components)
│   └── theme.ts               # Legacy theme (kept for compatibility)
├── hooks/
│   ├── useDesignTokens.ts     # Hook for accessing design tokens
│   ├── useTheme.ts            # Theme hook
│   └── useScreenOptions.ts    # Navigation screen options
├── lib/
│   ├── query-client.ts        # React Query + API utilities
│   └── storage.ts             # AsyncStorage helpers
├── navigation/
│   ├── RootStackNavigator.tsx # Main navigation
│   ├── MainTabNavigator.tsx   # Bottom tab bar
│   └── *StackNavigator.tsx    # Individual tab stacks
├── screens/
│   ├── AuthScreen.tsx         # Login/signup authentication
│   ├── OnboardingScreen.tsx   # First-launch tutorial (4 slides)
│   ├── ScanScreen.tsx         # Product search (home)
│   ├── CameraScanScreen.tsx   # AI camera scanning
│   ├── HistoryScreen.tsx      # Search history
│   ├── FavoritesScreen.tsx    # Saved products
│   ├── ProfileScreen.tsx      # User settings & subscription
│   └── ProductDetailScreen.tsx # Product profit breakdown
├── contexts/
│   ├── AuthContext.tsx        # Authentication state management
│   └── RevenueCatContext.tsx  # In-app purchase management
├── components/
│   └── UpgradeModal.tsx       # Pro subscription upgrade modal
└── types/
    └── product.ts             # TypeScript types

server/
├── index.ts                   # Express server setup
├── routes.ts                  # API endpoints
├── stripeClient.ts            # Stripe integration
└── seed-products.ts           # Create Stripe products
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

### Authentication
- `POST /api/auth/signup` - Create new account
  - Body: `{ email: string, password: string }`
  - Returns: `{ token: string, user: { id, email, subscriptionStatus, searchesRemaining } }`

- `POST /api/auth/login` - Login existing account
  - Body: `{ email: string, password: string }`
  - Returns: Same as signup

- `GET /api/auth/user` - Get current user info (requires Bearer token)
  - Returns: User object with subscription status

### Product Search
- `POST /api/search` - Search for a product on eBay via SerpAPI
  - Body: `{ query: string }`
  - Headers: `Authorization: Bearer <token>` (optional but tracks usage)
  - Returns: Top matching product with real eBay pricing and profit estimates

- `POST /api/search/all` - Get all matching listings
  - Body: `{ query: string, page?: number }`
  - Returns: `{ products: Product[], total: number }`

- `GET /api/trending` - Get trending products

### Payments (RevenueCat)
- `POST /api/subscription/sync` - Sync subscription status from RevenueCat
  - Headers: `Authorization: Bearer <token>`
  - Body: `{ isPro: boolean, revenuecatUserId: string }`
  - Called automatically after in-app purchase on iOS/Android

- Stripe endpoints kept for legacy/web support:
  - `POST /api/create-checkout-session` - Web checkout fallback
  - `POST /api/stripe-webhook` - Handle Stripe webhook events

## Running the App

The app runs on two workflows:
- **Start Backend**: Express server on port 5000
- **Start Frontend**: Expo dev server on port 8081

Users can test on physical devices using Expo Go by scanning the QR code.

## Features

1. **Real eBay Search**: Search any product to see current active listings
2. **AI Camera Scanning**: Take photos of products for AI-powered identification
3. **Profit Calculator**: Enter your cost to see net profit breakdown
4. **eBay Fee Estimation**: Automatically calculates ~13% eBay fees
5. **Search History**: Track all previous searches
6. **Favorites**: Save profitable products for later
7. **Custom Settings**: Set default costs and target profit margins
8. **User Authentication**: Secure signup/login with JWT, Google Sign-In, and Apple Sign-In
9. **Subscription Tiers**: Free (5 lifetime scans) or Pro ($8.99/mo unlimited)

## Subscription Model

- **Free Tier**: 5 lifetime product scans
- **Pro Tier**: $8.99/month for unlimited scans
- Users see an upgrade modal when they hit the free limit
- RevenueCat handles iOS/Android in-app purchases (prevents duplicate payments via Apple ID tracking)
- Stripe available as web fallback

## Database Schema

```sql
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  google_id VARCHAR(255),
  apple_id VARCHAR(255),
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  revenuecat_user_id VARCHAR(255),
  subscription_status VARCHAR(20) DEFAULT 'free',
  total_searches INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Recent Changes

- **Feb 2026**: Added Google Lens visual matching for exact product identification
  - Uses SerpAPI Google Lens engine for image-based product search
  - Falls back to Gemini AI text analysis if Lens doesn't find results
  - Much more accurate product matching (finds exact products, not similar ones)
- **Feb 2026**: Multi-platform search (Amazon, Walmart, Target, eBay, Mercari, Poshmark)
  - Switched from eBay-only to Google Shopping for multi-platform results
  - Dynamic platform badges show which marketplace each listing is from
  - Updated UI to remove eBay-specific language
- **Jan 2026**: Switched from Stripe to RevenueCat for iOS in-app purchases
  - RevenueCat handles Apple/Google payment processing
  - Prevents duplicate payments via Apple ID tracking
  - User subscription status syncs with backend
  - Restore purchases functionality added
- **Jan 2026**: Added authentication and subscription system
  - JWT-based signup/login with email/password
  - Email verification with 6-digit codes via Resend
  - Google Sign-In (native apps)
  - Apple Sign-In (iOS)
  - Free tier with 5 lifetime scans limit
  - Upgrade modal when limit reached
  - Profile screen with subscription status and logout
- Integrated SerpAPI for multi-platform product data
- Added Gemini AI for fallback product identification
- Added design tokens system for consistent theming
