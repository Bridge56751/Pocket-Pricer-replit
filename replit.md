# Price It

An Expo React Native mobile app that helps eBay sellers discover product values by scanning items with AI or searching eBay listings.

## Overview

This app allows eBay resellers to:
- Scan products with camera (AI-powered identification via Gemini)
- Search for products by name and see real active eBay listings
- View current eBay selling prices from live data
- Calculate estimated profit based on their costs (includes ~13% eBay fees)
- Save favorite products for later
- Track search and scan history

## Tech Stack

- **Frontend**: Expo React Native with TypeScript
- **Backend**: Express.js with TypeScript
- **eBay Data**: SerpAPI (real-time eBay listing search)
- **State Management**: TanStack React Query
- **Local Storage**: AsyncStorage for history, favorites, and settings
- **Navigation**: React Navigation (bottom tabs + native stack)
- **Styling**: Custom design tokens system with dark theme

## Environment Variables

- `SERPAPI_API_KEY` - Required for eBay listing search (get from https://serpapi.com)

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
│   ├── ScanScreen.tsx         # Product search (home)
│   ├── HistoryScreen.tsx      # Search history
│   ├── FavoritesScreen.tsx    # Saved products
│   ├── ProfileScreen.tsx      # User settings
│   ├── ProductDetailScreen.tsx # Product profit breakdown
│   └── BarcodeScannerScreen.tsx # Camera barcode scanner
└── types/
    └── product.ts             # TypeScript types

server/
├── index.ts                   # Express server setup
└── routes.ts                  # API endpoints
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

- `POST /api/search` - Search for a product on eBay via SerpAPI
  - Body: `{ query: string }`
  - Returns: Top matching product with real eBay pricing and profit estimates

- `POST /api/search/all` - Get all matching listings
  - Body: `{ query: string, page?: number }`
  - Returns: `{ products: Product[], total: number }`

- `GET /api/trending` - Get trending products

## Running the App

The app runs on two workflows:
- **Start Backend**: Express server on port 5000
- **Start Frontend**: Expo dev server on port 8081

Users can test on physical devices using Expo Go by scanning the QR code.

## Features

1. **Real eBay Search**: Search any product to see current active listings
2. **Profit Calculator**: Enter your cost to see net profit breakdown
3. **eBay Fee Estimation**: Automatically calculates ~13% eBay fees
4. **Search History**: Track all previous searches
5. **Favorites**: Save profitable products for later
6. **Custom Settings**: Set default costs and target profit margins

## Recent Changes

- **Jan 2026**: Integrated SerpAPI for real eBay listing data
- Removed barcode scanning, focused on text search for live listings
- Added design tokens system for consistent theming
