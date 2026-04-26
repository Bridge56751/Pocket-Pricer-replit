import { useEffect, useState } from "react";
import { Dimensions, Keyboard, type LayoutChangeEvent } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MIN_DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 800;
const OPEN_DURATION = 280;
const CLOSE_DURATION = 220;
const BACKDROP_MAX_OPACITY = 1;

export function useSheetDragToDismiss({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [shouldRender, setShouldRender] = useState(visible);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const sheetHeight = useSharedValue(0);

  useEffect(() => {
    if (visible && !shouldRender) {
      setShouldRender(true);
    }
  }, [visible, shouldRender]);

  useEffect(() => {
    if (shouldRender && visible) {
      translateY.value = withTiming(0, { duration: OPEN_DURATION });
    }
  }, [shouldRender, visible, translateY]);

  useEffect(() => {
    if (!visible && shouldRender) {
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration: CLOSE_DURATION },
        (finished) => {
          if (finished) {
            runOnJS(setShouldRender)(false);
          }
        }
      );
    }
  }, [visible, shouldRender, translateY]);

  const onLayout = (event: LayoutChangeEvent) => {
    sheetHeight.value = event.nativeEvent.layout.height;
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      runOnJS(Keyboard.dismiss)();
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const dynamicThreshold = Math.max(
        MIN_DISMISS_DISTANCE,
        sheetHeight.value / 3
      );
      if (
        translateY.value > dynamicThreshold ||
        e.velocityY > DISMISS_VELOCITY
      ) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const denom = sheetHeight.value > 0 ? sheetHeight.value : SCREEN_HEIGHT;
    const ratio = translateY.value / denom;
    const clamped = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    return { opacity: (1 - clamped) * BACKDROP_MAX_OPACITY };
  });

  return {
    shouldRender,
    gesture,
    animatedStyle: sheetAnimatedStyle,
    sheetAnimatedStyle,
    backdropAnimatedStyle,
    onLayout,
  };
}
