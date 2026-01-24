export interface Product {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  estimatedProfit: number;
  soldCount: number;
  avgShipping: number;
  ebayFees: number;
  category: string;
  condition: string;
  searchedAt: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  product: Product | null;
  searchedAt: string;
}

export interface FavoriteItem {
  id: string;
  product: Product;
  savedAt: string;
  notes?: string;
}

export interface UserSettings {
  defaultCost: number;
  defaultShippingCost: number;
  targetProfitMargin: number;
}
