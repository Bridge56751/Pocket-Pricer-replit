import { useEffect } from "react";
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

export function useSheetDragToDismiss({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const translateY = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
    }
  }, [visible, translateY]);

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
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 200 },
          (finished) => {
            if (finished) {
              runOnJS(onClose)();
            }
          }
        );
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return { gesture, animatedStyle, onLayout };
}
