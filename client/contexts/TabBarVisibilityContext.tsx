import React, { createContext, useContext, useMemo } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

type TabBarVisibilityContextValue = {
  opacity: SharedValue<number>;
};

const TabBarVisibilityContext = createContext<TabBarVisibilityContextValue | null>(null);

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const opacity = useSharedValue(1);
  const value = useMemo(() => ({ opacity }), [opacity]);
  return (
    <TabBarVisibilityContext.Provider value={value}>
      {children}
    </TabBarVisibilityContext.Provider>
  );
}

export function useTabBarVisibility(): TabBarVisibilityContextValue {
  const ctx = useContext(TabBarVisibilityContext);
  if (!ctx) {
    throw new Error("useTabBarVisibility must be used inside TabBarVisibilityProvider");
  }
  return ctx;
}
