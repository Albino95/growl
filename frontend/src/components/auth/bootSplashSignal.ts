/**
 * Tiny one-shot signals for the cold-start splash overlay (App.tsx):
 *
 * - `reveal start` fires the moment the splash begins its exit (the mark
 *   blooms out, the emerald fades). The app underneath uses it to settle
 *   (nav wrapper 1.03 → 1, Today greeting fade-in) *while* it is uncovered.
 * - `done` fires once the overlay has fully faded and unmounted. The Auth
 *   screen holds its entrance until then so it doesn't play hidden.
 */
export type BootRevealInfo = {
  /** False when reduce motion is on: listeners should snap, not move. */
  animate: boolean;
};

let revealInfo: BootRevealInfo | null = null;
const revealListeners = new Set<(info: BootRevealInfo) => void>();

let done = false;
const listeners = new Set<() => void>();

export function markBootRevealStart(info: BootRevealInfo = { animate: true }) {
  if (revealInfo) return;
  revealInfo = info;
  revealListeners.forEach((fn) => fn(info));
  revealListeners.clear();
}

export function isBootRevealStarted() {
  return revealInfo !== null;
}

/**
 * Calls `fn` once the splash starts revealing the app (immediately if it
 * already has). Returns an unsubscribe.
 */
export function onBootRevealStart(fn: (info: BootRevealInfo) => void): () => void {
  if (revealInfo) {
    fn(revealInfo);
    return () => undefined;
  }
  revealListeners.add(fn);
  return () => {
    revealListeners.delete(fn);
  };
}

export function markBootSplashDone() {
  if (done) return;
  // Never leave reveal listeners hanging (e.g. a path that skipped the exit).
  markBootRevealStart({ animate: false });
  done = true;
  listeners.forEach((fn) => fn());
  listeners.clear();
}

export function isBootSplashDone() {
  return done;
}

/** Calls `fn` once the splash is gone (immediately if it already is). Returns an unsubscribe. */
export function onBootSplashDone(fn: () => void): () => void {
  if (done) {
    fn();
    return () => undefined;
  }
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
