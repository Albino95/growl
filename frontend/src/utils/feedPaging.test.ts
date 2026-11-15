import { describe, it, expect } from 'vitest';
import {
  appendFeedPage,
  dedupeById,
  isStale,
  mergeRefreshedFirstPage,
  prependToFollowing,
} from './feedPaging';

type P = { id: string; v?: number; liked?: boolean };
const p = (id: string, extra: Partial<P> = {}): P => ({ id, ...extra });
const ids = (xs: P[]) => xs.map((x) => x.id);

describe('dedupeById', () => {
  it('keeps the first occurrence in order', () => {
    expect(ids(dedupeById([p('a'), p('b'), p('a'), p('c'), p('b')]))).toEqual(['a', 'b', 'c']);
  });
});

describe('appendFeedPage', () => {
  it('appends each section and skips ids already on screen in either section', () => {
    const cur = { following: [p('f1'), p('f2')], suggested: [p('s1')] };
    const next = appendFeedPage(cur, {
      following: [p('f2'), p('f3'), p('f3')],
      suggested: [p('s1'), p('f1'), p('s2')],
    });
    expect(ids(next.following)).toEqual(['f1', 'f2', 'f3']);
    expect(ids(next.suggested)).toEqual(['s1', 's2']);
  });

  it('does not overwrite an optimistic like with a drifted server copy', () => {
    const cur = { following: [p('f1', { liked: true })], suggested: [] as P[] };
    const next = appendFeedPage(cur, { following: [p('f1', { liked: false })], suggested: [] });
    expect(next.following[0].liked).toBe(true);
    expect(next).toBe(cur);
  });

  it('keeps an optimistic new post at the top across pages', () => {
    let cur = { following: [p('f1')], suggested: [p('s1')] };
    cur = prependToFollowing(cur, p('new'));
    cur = appendFeedPage(cur, { following: [p('new'), p('f2')], suggested: [p('s2')] });
    expect(ids(cur.following)).toEqual(['new', 'f1', 'f2']);
    expect(ids(cur.suggested)).toEqual(['s1', 's2']);
  });
});

describe('mergeRefreshedFirstPage', () => {
  it('refreshes in place, appends new, keeps deeper pages, moves across sections', () => {
    const cur = {
      following: [p('f1', { v: 1 }), p('f2'), p('f9')],
      suggested: [p('s1'), p('s2'), p('s9')],
    };
    const next = mergeRefreshedFirstPage(cur, {
      following: [p('f1', { v: 2 }), p('s1'), p('f0')],
      suggested: [p('s2'), p('f2')],
    });
    expect(ids(next.following)).toEqual(['f1', 'f9', 's1', 'f0']);
    expect(next.following[0].v).toBe(2);
    expect(ids(next.suggested)).toEqual(['s2', 's9', 'f2']);
    const all = [...ids(next.following), ...ids(next.suggested)];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('isStale', () => {
  it('treats missing / old timestamps as stale', () => {
    const now = 1_000_000;
    expect(isStale(null, 60_000, now)).toBe(true);
    expect(isStale(now - 59_000, 60_000, now)).toBe(false);
    expect(isStale(now - 60_000, 60_000, now)).toBe(true);
    expect(isStale(new Date(now - 5_000).toISOString(), 60_000, now)).toBe(false);
    expect(isStale('garbage', 60_000, now)).toBe(true);
  });
});
