import { describe, it, expect } from 'vitest';
import { matchesJournalQuery, mergeEntriesById, shouldSearchServer } from './journalSearch';

const e = (id: string, created_at: string, over: Record<string, unknown> = {}) => ({
  id,
  created_at,
  content: 'Ran by the river',
  title: null,
  mood: 'calm',
  tags: ['fitness'],
  ...over,
});

describe('matchesJournalQuery', () => {
  it('matches content, title, tags and mood case-insensitively', () => {
    expect(matchesJournalQuery(e('a', '1'), 'RIVER')).toBe(true);
    expect(matchesJournalQuery(e('a', '1', { title: 'Sunday long run' }), 'sunday')).toBe(true);
    expect(matchesJournalQuery(e('a', '1'), 'fit')).toBe(true);
    expect(matchesJournalQuery(e('a', '1'), 'calm')).toBe(true);
    expect(matchesJournalQuery(e('a', '1'), 'swim')).toBe(false);
    expect(matchesJournalQuery(e('a', '1'), '   ')).toBe(true);
  });
});

describe('mergeEntriesById', () => {
  it('adds server-only hits, keeps local copies, sorts newest first', () => {
    const local = [e('b', '2026-11-10', { content: 'local edit' }), e('a', '2026-11-01')];
    const server = [e('b', '2026-11-10', { content: 'stale' }), e('old', '2025-01-01'), e('mid', '2026-11-05')];
    const out = mergeEntriesById(local, server);
    expect(out.map((x) => x.id)).toEqual(['b', 'mid', 'a', 'old']);
    expect(out[0].content).toBe('local edit');
  });
  it('returns the same array when nothing to add', () => {
    const local = [e('a', '1')];
    expect(mergeEntriesById(local, [])).toBe(local);
  });
});

describe('shouldSearchServer', () => {
  it('only when more pages exist and the query is 2+ chars', () => {
    expect(shouldSearchServer('ru', true)).toBe(true);
    expect(shouldSearchServer('r', true)).toBe(false);
    expect(shouldSearchServer('run', false)).toBe(false);
  });
});
