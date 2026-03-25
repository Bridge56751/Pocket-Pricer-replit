import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HeaderButton } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import ScanScreen from "@/screens/ScanScreen";
import CameraScanScreen from "@/screens/CameraScanScreen";
import HistoryScreen from "@/screens/HistoryScreen";
import FavoritesScreen from "@/screens/FavoritesScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import SearchResultsScreen from "@/screens/SearchResultsScreen";
import PaywallScreen from "@/screens/PaywallScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useTheme } from "@/hooks/useTheme";
import { useDesignTokens } from "@/hooks/useDesignTokens";

interface ListingItem {
  id: string;
  title: string;
  imageUrl: string;
  currentPrice: number;
  originalPrice?: number;
  condition?: string;
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
  scannedImageId?: string;
  scannedImageUri?: string;
  usedLens?: boolean;
  productInfo?: {
    name: string;
    brand?: string;
    category?: string;
    description?: string;
  };
}

export interface CapturedPhoto {
  uri: string;
  base64: string;
}

export type RootStackParamList = {
  Home: { photosToProcess?: CapturedPhoto[]; prefillQuery?: string } | undefined;
  CameraScan: undefined;
  Paywall: { context?: "ebay" } | undefined;
  History: undefined;
  Favorites: undefined;
  Settings: undefined;
  SearchResults: { results: SearchResultsData };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();
  const { theme: designTheme } = useDesignTokens();

  const renderBackButton = (navigation: any, color?: string) => (
    <HeaderButton
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate("Home");
        }
      }}
      pressOpacity={0.7}
    >
      <Feather name="arrow-left" size={24} color={color || designTheme.colors.foreground} />
    </HeaderButton>
  );

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
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={({ navigation }) => ({
          headerTitle: "History",
          headerLeft: () => renderBackButton(navigation),
        })}
      />
      <Stack.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={({ navigation }) => ({
          headerTitle: "Favorites",
          headerLeft: () => renderBackButton(navigation),
        })}
      />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SearchResults"
        component={SearchResultsScreen}
        options={{
          headerTitle: "",
          headerBackVisible: false,
          headerTransparent: true,
          headerBlurEffect: "none" as any,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: "transparent",
          },
        }}
      />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ headerShown: false, gestureEnabled: true }}
      />
    </Stack.Navigator>
  );
}
