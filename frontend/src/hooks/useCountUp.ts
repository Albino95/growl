import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { duration as durations, easing } from '../theme/motion';
import { countUpFrame, safeCountTarget } from '../utils/countUp';
import { useReducedMotion } from './useReducedMotion';

type Options = {
  /** Default motion.duration.slow (520ms). */
  duration?: number;
  delay?: number;
  /** Start value on first mount (default 0). Later changes animate from the current value. */
  from?: number;
};

/**
 * Animate a number to `target` and return the integer to display.
 * Uses motion.easing.out; jumps straight to the target under Reduce Motion.
 *
 *   const shown = useCountUp(streakDays);
 *   <Text>{shown}</Text>
 */
export function useCountUp(target: number, opts: Options = {}): number {
  const reduced = useReducedMotion();
  const goal = safeCountTarget(target);
  const [shown, setShown] = useState(() => (reduced ? goal : safeCountTarget(opts.from ?? 0)));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const progress = useRef(new Animated.Value(0)).current;
  const { duration = durations.slow, delay = 0 } = opts;

  useEffect(() => {
    const start = shownRef.current;
    if (reduced || start === goal) {
      setShown(goal);
      return;
    }
    progress.setValue(0);
    const id = progress.addListener(({ value }) => {
      const next = countUpFrame(start, goal, value);
      if (next !== shownRef.current) {
        shownRef.current = next;
        setShown(next);
      }
    });
    // JS driver: we need per-frame values in JS to render text.
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: easing.out,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setShown(goal);
    });
    return () => {
      anim.stop();
      progress.removeListener(id);
    };
  }, [goal, reduced, duration, delay, progress]);

  return shown;
}

export default useCountUp;
