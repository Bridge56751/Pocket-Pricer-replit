import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SearchHistoryItem, FavoriteItem, UserSettings } from "@/types/product";

const STORAGE_KEYS = {
  SEARCH_HISTORY: "@ebay_profit/search_history",
  FAVORITES: "@ebay_profit/favorites",
  USER_SETTINGS: "@ebay_profit/user_settings",
};

const DEFAULT_SETTINGS: UserSettings = {
  defaultCost: 0,
  defaultShippingCost: 5,
  targetProfitMargin: 30,
};

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addSearchHistory(item: SearchHistoryItem): Promise<void> {
  try {
    const history = await getSearchHistory();
    const newHistory = [item, ...history.filter(h => h.id !== item.id)].slice(0, 50);
    await AsyncStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(newHistory));
  } catch (error) {
    console.error("Failed to save search history:", error);
  }
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
  } catch (error) {
    console.error("Failed to clear search history:", error);
  }
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.FAVORITES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function addFavorite(item: FavoriteItem): Promise<void> {
  try {
    const favorites = await getFavorites();
    const newFavorites = [item, ...favorites.filter(f => f.id !== item.id)];
    await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
  } catch (error) {
    console.error("Failed to save favorite:", error);
  }
}

export async function removeFavorite(id: string): Promise<void> {
  try {
    const favorites = await getFavorites();
    const newFavorites = favorites.filter(f => f.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(newFavorites));
  } catch (error) {
    console.error("Failed to remove favorite:", error);
  }
}

export async function isFavorite(productId: string): Promise<boolean> {
  try {
    const favorites = await getFavorites();
    return favorites.some(f => f.product.id === productId);
  } catch {
    return false;
  }
}

export async function getUserSettings(): Promise<UserSettings> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  try {
    const current = await getUserSettings();
    const newSettings = { ...current, ...settings };
    await AsyncStorage.setItem(STORAGE_KEYS.USER_SETTINGS, JSON.stringify(newSettings));
  } catch (error) {
    console.error("Failed to save user settings:", error);
  }
}
