import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import ProductDetailScreen from "@/screens/ProductDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import type { Product } from "@/types/product";

export type RootStackParamList = {
  Main: undefined;
  ProductDetail: { product: Product };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{
          headerTitle: "Product Details",
        }}
      />
    </Stack.Navigator>
  );
}
