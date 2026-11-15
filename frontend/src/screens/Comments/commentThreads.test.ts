import { describe, it, expect } from 'vitest';
import { idsRemovedWith, threadComments } from './commentThreads';

const c = (id: string, parent_id: string | null = null) => ({ id, parent_id });

describe('threadComments', () => {
  it('puts replies under their parent, keeping chronological order', () => {
    const rows = [c('a'), c('b'), c('a1', 'a'), c('c'), c('b1', 'b'), c('a2', 'a')];
    expect(threadComments(rows).map((r) => `${r.comment.id}:${r.depth}`)).toEqual([
      'a:0',
      'a1:1',
      'a2:1',
      'b:0',
      'b1:1',
      'c:0',
    ]);
  });

  it('keeps a reply whose parent is not loaded as a top-level row', () => {
    const rows = [c('x1', 'gone'), c('a')];
    const out = threadComments(rows);
    expect(out.map((r) => [r.comment.id, r.depth, r.threadId])).toEqual([
      ['x1', 0, 'x1'],
      ['a', 0, 'a'],
    ]);
  });

  it('treats missing parent_id (old servers) as top-level', () => {
    expect(threadComments([{ id: 'a' }, { id: 'b' }]).every((r) => r.depth === 0)).toBe(true);
  });
});

describe('idsRemovedWith', () => {
  it('includes direct replies', () => {
    const rows = [c('a'), c('a1', 'a'), c('b'), c('b1', 'b')];
    expect([...idsRemovedWith(rows, 'a')].sort()).toEqual(['a', 'a1']);
  });
});
