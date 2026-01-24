import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import ScanScreen from "@/screens/ScanScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ScanStackParamList = {
  Scan: undefined;
};

const Stack = createNativeStackNavigator<ScanStackParamList>();

export default function ScanStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          headerTitle: () => <HeaderTitle title="eBay Profit" />,
        }}
      />
    </Stack.Navigator>
  );
}
