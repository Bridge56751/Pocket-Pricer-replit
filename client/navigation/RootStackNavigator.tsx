import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ScanScreen from "@/screens/ScanScreen";
import CameraScanScreen from "@/screens/CameraScanScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import FavoritesScreen from "@/screens/FavoritesScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import SearchResultsScreen from "@/screens/SearchResultsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";

interface ListingItem {
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

interface SearchResultsData {
  query: string;
  totalListings: number;
  avgListPrice: number;
  avgSalePrice: number | null;
  soldCount: number;
  bestBuyNow: number;
  topSalePrice: number | null;
  listings: ListingItem[];
  scannedImageUri?: string;
  productInfo?: {
    name: string;
    brand?: string;
    category?: string;
    description?: string;
  };
}

export type RootStackParamList = {
  Home: undefined;
  CameraScan: undefined;
  History: undefined;
  Favorites: undefined;
  Settings: undefined;
  SearchResults: { results: SearchResultsData };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={ScanScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CameraScan"
        component={CameraScanScreen}
        options={{
          headerTitle: "Scan Product",
        }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{
          headerTitle: "History",
        }}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          headerTitle: "Favorites",
        }}
      />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          headerTitle: "Settings",
        }}
      />
      <Stack.Screen
        name="SearchResults"
        component={SearchResultsScreen}
        options={{
          headerTitle: "Scan Result",
        }}
      />
    </Stack.Navigator>
  );
}
