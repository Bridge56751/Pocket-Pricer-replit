import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import CameraScanScreen from "@/screens/CameraScanScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type CameraScanStackParamList = {
  CameraScan: undefined;
};

const Stack = createNativeStackNavigator<CameraScanStackParamList>();

export default function CameraScanStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="CameraScan"
        component={CameraScanScreen}
        options={{
          headerTitle: "Scan Product",
        }}
      />
    </Stack.Navigator>
  );
}
