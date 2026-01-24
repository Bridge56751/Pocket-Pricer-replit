# eBay Profit Estimator - Design Guidelines

## Brand Identity

**Purpose**: Empowers eBay resellers to make fast, confident sourcing decisions by instantly showing profit potential on any product.

**Aesthetic Direction**: **Professional hustle** - Sharp, data-driven, confidence-inspiring. Think Bloomberg Terminal meets modern fintech. High contrast for quick scanning, bold typography for profit numbers, no-nonsense efficiency. This app is a moneymaking TOOL, not a playground.

**Memorable Element**: Profit estimates displayed in LARGE, bold typography with color-coded indicators (green for profit, red for loss, gray for break-even). Every interaction reinforces: "Is this worth flipping?"

## Navigation Architecture

**Root Navigation**: Tab Bar (4 tabs)
- **Scan** (camera icon) - Core action: scan barcode/search product
- **History** (clock icon) - Past searches and estimates
- **Favorites** (star icon) - Saved profitable opportunities
- **Profile** (user icon) - Account settings, preferences

**Authentication**: Required (SSO)
- Saves search history and favorites across devices
- Apple Sign-In (iOS), Google Sign-In (Android/cross-platform)

## Screen Specifications

### 1. Scan/Search Screen (Default tab)
**Purpose**: Instantly search products and get profit estimates

**Layout**:
- Header: Transparent, title "Scan Product"
- Main content: Scrollable
  - Top: Large search bar with barcode scan button on right
  - Below: Recent scans grid (2 columns, product images with quick profit badges)
- Floating: Camera FAB (bottom-right) for quick barcode scan
- Safe area: Top = headerHeight + Spacing.xl, Bottom = tabBarHeight + Spacing.xl

**Components**: Search bar, barcode scanner button, grid of product cards

### 2. Product Detail Modal (after search)
**Purpose**: Show detailed profit breakdown

**Layout**:
- Header: Default navigation with close button (left), "Save" button (right)
- Main content: Scrollable form-style layout
  - Product image (full-width)
  - Product title (bold, large)
  - Current eBay selling price (huge, color-coded)
  - Profit estimate section (card with breakdown: cost, fees, shipping, net profit)
  - Historical pricing chart
  - Similar listings (horizontal scroll)
- Safe area: Bottom = insets.bottom + Spacing.xl

### 3. History Screen
**Purpose**: View past product searches

**Layout**:
- Header: Default, title "History", search bar below
- Main content: List (FlatList)
  - Each item: Product image, title, profit estimate badge, timestamp
- Empty state: "No searches yet" with illustration
- Safe area: Top = Spacing.xl, Bottom = tabBarHeight + Spacing.xl

### 4. Favorites Screen
**Purpose**: Saved profitable opportunities

**Layout**:
- Header: Default, title "Favorites"
- Main content: Grid (2 columns)
  - Product cards with profit badges
- Empty state: "No favorites saved" with illustration
- Safe area: Top = Spacing.xl, Bottom = tabBarHeight + Spacing.xl

### 5. Profile Screen
**Purpose**: Account and app settings

**Layout**:
- Header: Transparent, title "Profile"
- Main content: Scrollable form
  - Avatar + name (editable)
  - Settings sections: Default profit margin, fee percentages, notifications
  - Account section: Privacy policy, Terms, Log out, Delete account
- Safe area: Top = headerHeight + Spacing.xl, Bottom = tabBarHeight + Spacing.xl

## Color Palette

- **Primary**: `#10B981` (Emerald green - profit, growth)
- **Danger**: `#EF4444` (Sharp red - losses)
- **Background**: `#1F2937` (Dark charcoal - serious, data-focused)
- **Surface**: `#374151` (Lighter charcoal - cards, elevated surfaces)
- **Text Primary**: `#F9FAFB` (Off-white - high contrast)
- **Text Secondary**: `#9CA3AF` (Muted gray - labels)
- **Success Background**: `#064E3B` (Dark green tint for profit cards)
- **Border**: `#4B5563` (Subtle gray - dividers)

## Typography

**Font**: Inter (Google Font) - Clean, legible, data-optimized
- **Display (Profit amounts)**: Inter Bold, 48px
- **Title**: Inter Bold, 24px
- **Heading**: Inter SemiBold, 18px
- **Body**: Inter Regular, 16px
- **Caption**: Inter Regular, 14px

## Visual Design

- **Icons**: Feather icons from @expo/vector-icons
- **Touchable Feedback**: Subtle opacity change (0.7) on press
- **Floating FAB Shadow**:
  - shadowOffset: {width: 0, height: 2}
  - shadowOpacity: 0.10
  - shadowRadius: 2
- **Cards**: Rounded corners (12px), surface color background

## Assets to Generate

1. **icon.png** - App icon: Barcode with upward-trending profit arrow overlay. WHERE USED: Device home screen
2. **splash-icon.png** - Simplified barcode icon. WHERE USED: App launch screen
3. **empty-search.png** - Barcode scanner with magnifying glass. WHERE USED: Scan screen when no recent searches
4. **empty-history.png** - Clock with checkmark, minimal style. WHERE USED: History screen empty state
5. **empty-favorites.png** - Star with bookmark, clean line art. WHERE USED: Favorites screen empty state
6. **profit-success.png** - Upward arrow with dollar sign, celebratory but professional. WHERE USED: Product detail when profit margin exceeds user's threshold

**Asset Style**: Minimal line art in emerald green (#10B981) on transparent background. Clean, professional, not cartoonish.