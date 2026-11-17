/**
 * Platform-free core of useKeyboardInset, kept separate so it can be unit-tested
 * without a React renderer (vitest runs in node with a react-native stub).
 */

export type KeyboardFrameEvent = {
  endCoordinates: { screenY: number; height?: number };
  duration?: number;
};

export type KeyboardLike = {
  addListener: (
    event: 'keyboardWillChangeFrame' | 'keyboardWillHide',
    cb: (e: KeyboardFrameEvent) => void
  ) => { remove: () => void };
};

export type MeasurableNode = {
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void;
};

export type KeyboardInsetDeps = {
  keyboard: KeyboardLike;
  /** Full screen height in points (Dimensions.get('screen').height). */
  screenHeight?: number;
  /** Kept for API compatibility; no longer measured (see below). */
  getNode?: () => MeasurableNode | null | undefined;
  /** Called with a new, rounded, non-negative inset (only when it changes). */
  onInset: (inset: number, duration?: number) => void;
  initial?: number;
};

/**
 * Subscribes to keyboard frame changes and reports how many points of a
 * bottom-anchored wrapper are covered by the keyboard: the keyboard's on-screen
 * height. Every caller's wrapper reaches the bottom of its screen / sheet /
 * modal (pageSheet and bottom sheets end at the screen's bottom edge).
 *
 * Why not measureInWindow? Under the New Architecture, views inside a Modal
 * (pageSheet, transparent sheets) report coordinates relative to the modal's
 * own surface, not the window — so "wrapper bottom − keyboard top" came out
 * short by the sheet's top inset and the composer stayed hidden. The keyboard
 * height needs no view coordinates at all.
 */
export function subscribeKeyboardInset({
  keyboard,
  onInset,
  screenHeight,
  initial = 0,
}: KeyboardInsetDeps) {
  let current = initial;
  let active = true;

  const apply = (next: number, duration?: number) => {
    if (!active) return;
    const value = Math.max(0, Math.round(next));
    if (value === current) return;
    current = value;
    onInset(value, duration);
  };

  const onFrame = keyboard.addListener('keyboardWillChangeFrame', (e) => {
    const { screenY, height } = e.endCoordinates;
    const h = Number.isFinite(height) ? (height as number) : 0;
    // "Prefer Cross-Fade Transitions" reports screenY 0 with the real height.
    if (screenY === 0 && h > 0) return apply(h, e.duration);
    if (!Number.isFinite(screenY)) return;
    if (screenHeight && screenHeight > 0) {
      // Keyboard moving off-screen (hide / undock) → nothing covered.
      if (screenY >= screenHeight - 1) return apply(0, e.duration);
      return apply(Math.min(h > 0 ? h : screenHeight - screenY, screenHeight - screenY), e.duration);
    }
    apply(h, e.duration);
  });
  const onHide = keyboard.addListener('keyboardWillHide', (e) => apply(0, e?.duration));

  return () => {
    active = false;
    onFrame.remove();
    onHide.remove();
  };
}
