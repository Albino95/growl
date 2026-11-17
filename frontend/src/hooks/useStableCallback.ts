import { useCallback, useRef } from 'react';

/**
 * Returns a function with a stable identity that always calls the latest `fn`.
 * Use for handlers passed to memoized list items so they don't re-render when
 * the parent re-renders with new state.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

export default useStableCallback;
