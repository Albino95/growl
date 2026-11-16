import { useEffect, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, type View } from 'react-native';
import { subscribeKeyboardInset, type KeyboardLike } from './keyboardInsetCore';

/**
 * Bottom padding that keeps a screen's composer above the iOS keyboard.
 *
 * Returns the keyboard's on-screen height for wrappers that reach the bottom
 * of their screen / sheet (all current callers). Correct inside pageSheet /
 * formSheet modals and transparent bottom sheets, where view coordinates are
 * relative to the modal surface and KeyboardAvoidingView mis-computes.
 *
 * Apply the returned value as `paddingBottom` on a view *inside* `wrapperRef`
 * (the wrapper itself must keep its full height). Android returns 0 — the
 * window resizes there (softwareKeyboardLayoutMode "resize", Expo's default).
 */
export function useKeyboardInset(wrapperRef: RefObject<View | null>): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    return subscribeKeyboardInset({
      keyboard: Keyboard as unknown as KeyboardLike,
      getNode: () => wrapperRef.current,
      screenHeight: Dimensions.get('screen').height,
      onInset: (value, duration) => {
        if (duration && duration > 0) {
          LayoutAnimation.configureNext({
            duration,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setInset(value);
      },
    });
  }, [wrapperRef]);

  return inset;
}
