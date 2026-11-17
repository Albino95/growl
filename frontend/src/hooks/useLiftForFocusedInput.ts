import { useEffect, useRef, type RefObject } from 'react';
import { Animated, Easing, Keyboard, Platform, type TextInput } from 'react-native';

/**
 * For short, fixed-height tool panels at the bottom of full-screen editors
 * (photo/video text tools) that the iOS keyboard covers completely: returns a
 * translateY that slides the panel up *just enough* to keep `inputRef` (when
 * focused) above the keyboard, and back down when it hides. The panel must be
 * rendered after the content it may overlap and have an opaque background.
 *
 * Android returns a constant 0 (window resizes).
 */
export function useLiftForFocusedInput(
  inputRef: RefObject<TextInput | null>,
  { gap = 12 }: { gap?: number } = {}
): Animated.Value {
  const lift = useRef(new Animated.Value(0)).current;
  const liftRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const animateTo = (next: number, duration?: number) => {
      const value = Math.max(0, Math.round(next));
      if (value === liftRef.current) return;
      liftRef.current = value;
      Animated.timing(lift, {
        toValue: -value,
        duration: duration && duration > 0 ? duration : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const onFrame = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const input = inputRef.current;
      if (!input || !input.isFocused()) return;
      const kbTop = e.endCoordinates.screenY;
      input.measureInWindow((_x, y, _w, h) => {
        if (!Number.isFinite(y) || !Number.isFinite(h)) return;
        // measureInWindow includes the current transform — add it back.
        const restingBottom = y + h + liftRef.current;
        animateTo(restingBottom + gap - kbTop, e.duration);
      });
    });
    const onHide = Keyboard.addListener('keyboardWillHide', (e) => animateTo(0, e.duration));
    return () => {
      onFrame.remove();
      onHide.remove();
    };
  }, [inputRef, lift, gap]);

  return lift;
}
