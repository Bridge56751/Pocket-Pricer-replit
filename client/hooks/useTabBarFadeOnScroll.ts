import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAnimatedScrollHandler } from "react-native-reanimated";
import { useTabBarVisibility } from "@/contexts/TabBarVisibilityContext";

const FADE_START = 40;
const FADE_END = 160;

export function useTabBarFadeOnScroll() {
  const { opacity } = useTabBarVisibility();

  const handler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const t = Math.min(Math.max((y - FADE_START) / (FADE_END - FADE_START), 0), 1);
      opacity.value = 1 - t;
    },
  });

  useFocusEffect(
    useCallback(() => {
      opacity.value = 1;
      return () => {
        opacity.value = 1;
      };
    }, [opacity])
  );

  return handler;
}
