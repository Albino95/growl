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
  /** Current wrapper node (may be null before mount / after unmount). */
  getNode: () => MeasurableNode | null | undefined;
  /** Called with a new, rounded, non-negative inset (only when it changes). */
  onInset: (inset: number, duration?: number) => void;
  initial?: number;
};

/**
 * Subscribes to keyboard frame changes and reports how many points of the
 * wrapper's bottom edge are covered by the keyboard, in *screen* coordinates:
 * (wrapper bottom on screen) − (keyboard top on screen). Returns unsubscribe.
 */
export function subscribeKeyboardInset({ keyboard, getNode, onInset, initial = 0 }: KeyboardInsetDeps) {
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
    const kbTop = e.endCoordinates.screenY;
    const node = getNode();
    if (!node || !Number.isFinite(kbTop)) return;
    node.measureInWindow((_x, y, _w, h) => {
      if (!Number.isFinite(y) || !Number.isFinite(h)) return;
      apply(y + h - kbTop, e.duration);
    });
  });
  const onHide = keyboard.addListener('keyboardWillHide', (e) => apply(0, e?.duration));

  return () => {
    active = false;
    onFrame.remove();
    onHide.remove();
  };
}
