import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Poll cadence while someone is actively chatting. */
export const POLL_ACTIVE_MS = 8_000;
/** Poll cadence once the thread / inbox has been quiet for IDLE_AFTER_MS. */
export const POLL_IDLE_MS = 20_000;
export const IDLE_AFTER_MS = 2 * 60_000;

/** Delay before the next poll given the last activity (send, react, typing, new message). */
export function nextPollDelay(lastActivityAt: number, now: number): number {
  return now - lastActivityAt >= IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
}

/**
 * Polls only while the screen is focused AND the app is in the foreground.
 * - Refreshes immediately when the screen regains focus or the app comes back.
 * - 8 s while active, backs off to 20 s after 2 minutes without activity.
 * - `poll` may resolve `true` when it found something new (counts as activity).
 * - `resetKey` restarts the loop (e.g. the open conversation id). A new truthy key
 *   means the caller has just loaded it, so the first poll waits one interval.
 *
 * Returns `markActivity()` for user actions that should keep the fast cadence.
 */
export function useFocusedPolling(
  poll: () => Promise<boolean | void> | boolean | void,
  resetKey: string | null = null
): () => void {
  const isFocused = useIsFocused();
  const pollRef = useRef(poll);
  pollRef.current = poll;
  const lastActivityRef = useRef(Date.now());
  const mountedRef = useRef(false);
  const prevKeyRef = useRef<string | null>(resetKey);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let appActive = AppState.currentState === 'active';

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (cancelled || !appActive) return;
      timer = setTimeout(run, nextPollDelay(lastActivityRef.current, Date.now()));
    };
    const run = async () => {
      timer = null;
      if (cancelled || !appActive) return;
      try {
        const changed = await pollRef.current();
        if (changed === true) lastActivityRef.current = Date.now();
      } catch {
        /* next tick retries */
      }
      schedule();
    };

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const was = appActive;
      appActive = next === 'active';
      if (appActive && !was) {
        lastActivityRef.current = Date.now();
        clear();
        void run(); // back in the foreground: refresh now
      } else if (!appActive) {
        clear();
      }
    });

    const first = !mountedRef.current;
    const keyOpened = prevKeyRef.current !== resetKey && !!resetKey;
    mountedRef.current = true;
    prevKeyRef.current = resetKey;
    lastActivityRef.current = Date.now();
    if (first || keyOpened) schedule();
    else void run(); // regained focus (or went back to the inbox): refresh now

    return () => {
      cancelled = true;
      clear();
      sub.remove();
    };
  }, [isFocused, resetKey]);

  return markActivity;
}
