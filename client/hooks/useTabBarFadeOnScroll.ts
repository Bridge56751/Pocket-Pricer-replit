import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useAnimatedScrollHandler } from "react-native-reanimated";
import { useTabBarVisibility } from "@/contexts/TabBarVisibilityContext";

const DEFAULT_FADE_START = 40;
const DEFAULT_FADE_END = 160;

export function useTabBarFadeOnScroll(options?: { fadeStart?: number; fadeEnd?: number }) {
  const { opacity } = useTabBarVisibility();
  const fadeStart = options?.fadeStart ?? DEFAULT_FADE_START;
  const fadeEnd = options?.fadeEnd ?? DEFAULT_FADE_END;

  const handler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const t = Math.min(Math.max((y - fadeStart) / (fadeEnd - fadeStart), 0), 1);
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
