import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the OS "Reduce Motion" setting is on. Updates live when the user
 * toggles it. Use it to swap movement for short opacity crossfades.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(!!value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      if (mounted) setReduced(!!value);
    });
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}

export default useReducedMotion;
