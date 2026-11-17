import { useCallback, useEffect, useRef, useState } from 'react';
import { searchAll, type SearchResult, type SearchType } from '../../services/api/search';

export const SEARCH_DEBOUNCE_MS = 250;
const SEE_ALL_PAGE = 20;

export type SeeAllType = Exclude<SearchType, 'all'>;

export type SeeAllState = {
  type: SeeAllType;
  query: string;
  result: SearchResult | null;
  cursor: string | null;
  loading: boolean;
  error: string | null;
};

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Search didn’t go through. Try again.';
}

/**
 * Debounced Explore search. Every new keystroke aborts the in-flight request and drops its
 * answer (request sequence check), so results always belong to the latest query.
 */
export function useExploreSearch(query: string) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [committedQuery, setCommittedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeAll, setSeeAll] = useState<SeeAllState | null>(null);

  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seeAllSeqRef = useRef(0);
  const seeAllAbortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
  }, []);

  const run = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      cancel();
      if (!q) return;
      const seq = seqRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const res = await searchAll(q, { type: 'all', signal: controller.signal });
        if (seq !== seqRef.current) return;
        setResult(res);
        setCommittedQuery(q);
      } catch (e) {
        if (seq !== seqRef.current || controller.signal.aborted) return;
        setError(messageOf(e));
        setResult(null);
      } finally {
        if (seq === seqRef.current) {
          setLoading(false);
          abortRef.current = null;
        }
      }
    },
    [cancel]
  );

  useEffect(() => {
    const q = query.trim();
    seeAllAbortRef.current?.abort();
    seeAllSeqRef.current += 1;
    setSeeAll(null);
    if (!q) {
      cancel();
      setResult(null);
      setCommittedQuery('');
      setLoading(false);
      setError(null);
      return;
    }
    // Drop whatever is in flight for the previous text right away.
    cancel();
    setLoading(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void run(q);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [query, run, cancel]);

  useEffect(
    () => () => {
      cancel();
      seeAllAbortRef.current?.abort();
    },
    [cancel]
  );

  const loadSeeAll = useCallback(async (type: SeeAllType, q: string, cursor: string | null, prev: SearchResult | null) => {
    seeAllAbortRef.current?.abort();
    const seq = ++seeAllSeqRef.current;
    const controller = new AbortController();
    seeAllAbortRef.current = controller;
    setSeeAll({ type, query: q, result: prev, cursor, loading: true, error: null });
    try {
      const page = await searchAll(q, { type, limit: SEE_ALL_PAGE, cursor, signal: controller.signal });
      if (seq !== seeAllSeqRef.current) return;
      const merged: SearchResult = prev
        ? {
            ...page,
            people: [...prev.people, ...page.people.filter((p) => !prev.people.some((x) => x.id === p.id))],
            posts: [...prev.posts, ...page.posts.filter((p) => !prev.posts.some((x) => x.id === p.id))],
            tags: [...prev.tags, ...page.tags.filter((t) => !prev.tags.some((x) => x.tag === t.tag))],
          }
        : page;
      setSeeAll({ type, query: q, result: merged, cursor: page.next_cursor, loading: false, error: null });
    } catch (e) {
      if (seq !== seeAllSeqRef.current || controller.signal.aborted) return;
      setSeeAll({ type, query: q, result: prev, cursor, loading: false, error: messageOf(e) });
    }
  }, []);

  const openSeeAll = useCallback(
    (type: SeeAllType) => {
      const q = committedQuery || query.trim();
      if (q) void loadSeeAll(type, q, null, null);
    },
    [committedQuery, query, loadSeeAll]
  );

  const loadMore = useCallback(() => {
    if (!seeAll || seeAll.loading || !seeAll.cursor) return;
    void loadSeeAll(seeAll.type, seeAll.query, seeAll.cursor, seeAll.result);
  }, [seeAll, loadSeeAll]);

  const retrySeeAll = useCallback(() => {
    if (!seeAll) return;
    void loadSeeAll(seeAll.type, seeAll.query, seeAll.result ? seeAll.cursor : null, seeAll.result);
  }, [seeAll, loadSeeAll]);

  const closeSeeAll = useCallback(() => {
    seeAllAbortRef.current?.abort();
    seeAllSeqRef.current += 1;
    setSeeAll(null);
  }, []);

  /** Search right away (keyboard Search / retry), skipping the debounce. */
  const runNow = useCallback(() => void run(query), [run, query]);

  return {
    result,
    committedQuery,
    loading,
    error,
    runNow,
    seeAll,
    openSeeAll,
    closeSeeAll,
    loadMore,
    retrySeeAll,
  };
}
