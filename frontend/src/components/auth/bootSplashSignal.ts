/**
 * Tiny one-shot signal so the Auth screen can hold its entrance animation
 * until the cold-start splash overlay (App.tsx) has faded away. Without this
 * the entrance would play hidden underneath the splash.
 */
let done = false;
const listeners = new Set<() => void>();

export function markBootSplashDone() {
  if (done) return;
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
