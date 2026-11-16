import { useEffect, useState, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, Platform, type View } from 'react-native';
import { subscribeKeyboardInset, type KeyboardLike } from './keyboardInsetCore';

/**
 * Bottom padding that keeps a screen's composer above the iOS keyboard.
 *
 * Measures the real overlap in *screen* coordinates when the keyboard moves:
 * (bottom of `wrapperRef` on screen) − (top of the keyboard on screen).
 * Unlike KeyboardAvoidingView + keyboardVerticalOffset, this is correct inside
 * pageSheet / formSheet modals, transparent bottom-sheet modals, nested
 * navigators and animated wrappers, where the view's local frame and the
 * keyboard's screen frame don't line up.
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
