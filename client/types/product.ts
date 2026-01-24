export interface Product {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number;
  estimatedProfit?: number;
  soldCount?: number;
  avgShipping?: number;
  ebayFees?: number;
  category?: string;
  condition: string;
  shipping?: number;
  link?: string;
  seller?: string;
  searchedAt?: string;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  product: Product | null;
  searchedAt: string;
  results?: SearchResultsData;
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

export interface ListingItem {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number;
  condition: string;
  shipping: number;
  link: string;
  seller?: string;
}

export interface SearchResultsData {
  query: string;
  totalListings: number;
  avgListPrice: number;
  avgSalePrice: number | null;
  soldCount: number;
  bestBuyNow: number;
  topSalePrice: number | null;
  listings: ListingItem[];
}
