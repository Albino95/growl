import { useEffect, useState } from 'react';

/**
 * True only once `active` has stayed true for `delayMs`. Use it to avoid
 * flashing a busy UI for work that usually finishes instantly (e.g. the
 * video editor's Done, which is normally synchronous).
 */
export function useDelayedFlag(active: boolean, delayMs = 150): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  return active && shown;
}

export default useDelayedFlag;
