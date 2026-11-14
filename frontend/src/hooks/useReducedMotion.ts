import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * One app-wide subscription to the OS "Reduce Motion" setting. Every hook
 * instance reads the same module-level value, so a list of 50 animated rows
 * adds 0 extra AccessibilityInfo listeners.
 */
let reduced = false;
let started = false;
const listeners = new Set<() => void>();

function set(value: boolean) {
  if (value === reduced) return;
  reduced = value;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => set(!!value))
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => set(!!value));
}

/** Current value without React (e.g. inside an event handler or animation helper). */
export function getReducedMotion(): boolean {
  start();
  return reduced;
}

/** Subscribe outside React. Returns an unsubscribe function. */
export function subscribeReducedMotion(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * True when the OS "Reduce Motion" setting is on. Updates live when the user
 * toggles it. Use it to swap movement for short opacity crossfades and to
 * stop ambient loops.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotion);
}

export default useReducedMotion;
