import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerFeedback } from '../utils/interactionFeedback';

/** Grow! emerald for RefreshControl spinners. */
export const REFRESH_TINT = '#059669';

/**
 * Pull-to-refresh with the house feel: a rigid tap + refresh tone (Full) when
 * the refresh starts (RefreshControl only reports the threshold via
 * onRefresh), a light tap when fresh content lands.
 * Spread the result into <RefreshControl {...refresh} />.
 *
 *   const refresh = useRefresh(loadFeed);
 *   <FlatList refreshControl={<RefreshControl {...refresh} />} />
 */
export function useRefresh(fn: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Pass `{ haptics: false }` for programmatic refreshes (e.g. re-tapping the
   * active tab) — the spinner still shows, the ticks stay quiet.
   */
  const onRefresh = useCallback(async (opts?: { haptics?: boolean }) => {
    if (busy.current) return;
    busy.current = true;
    const withHaptics = opts?.haptics !== false;
    setRefreshing(true);
    if (withHaptics) triggerFeedback('refreshThreshold');
    let ok = true;
    try {
      await fnRef.current();
    } catch {
      ok = false;
    } finally {
      busy.current = false;
      if (mounted.current) {
        setRefreshing(false);
        if (ok && withHaptics) triggerFeedback('refreshDone');
      }
    }
  }, []);

  return {
    refreshing,
    onRefresh,
    /** iOS spinner color. */
    tintColor: REFRESH_TINT,
    /** Android spinner colors. */
    colors: [REFRESH_TINT],
  };
}

export default useRefresh;
