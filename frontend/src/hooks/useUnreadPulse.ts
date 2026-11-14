import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { breathe, duration } from '../theme/motion';
import { useReducedMotion } from './useReducedMotion';

/** Cycles a badge icon pulses when its unread count goes up. */
export const UNREAD_PULSE_CYCLES = 3;

/** Last count seen per badge key, shared across mounts (every screen header has its own bell). */
const lastSeen = new Map<string, number>();

/**
 * Scale value for an unread icon: pulses at most 3 cycles when `count`
 * increases (new activity), then rests at 1. No pulse under Reduce Motion,
 * none when the count stays the same or goes down. `key` makes "increase"
 * global, so navigating to a new screen doesn't re-pulse an old count.
 */
export function useUnreadPulse(count: number, key?: string): Animated.Value {
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(key ? (lastSeen.get(key) ?? 0) : 0);
  const reduced = useReducedMotion();

  const awaitingFirstCount = useRef(true);

  useEffect(() => {
    // The badge mounts with 0 before its first fetch — don't record that as "read".
    if (awaitingFirstCount.current && count <= 0) return;
    awaitingFirstCount.current = false;
    const increased = count > prev.current;
    prev.current = count;
    if (key) lastSeen.set(key, count);
    if (!increased || count <= 0) {
      if (count <= 0) pulse.setValue(1);
      return;
    }
    const anim = breathe(
      pulse,
      1,
      1.14,
      { period: duration.slow * 2, iterations: UNREAD_PULSE_CYCLES },
      reduced
    );
    if (!anim) return;
    anim.start(() => pulse.setValue(1));
    return () => {
      anim.stop();
      pulse.setValue(1);
    };
  }, [count, key, pulse, reduced]);

  return pulse;
}
