import { describe, it, expect } from 'vitest';
import {
  collapseRepeats,
  levenshtein,
  usernameSearchRank,
} from '../../src/utils/usernameSearch';

describe('usernameSearch', () => {
  it('collapses repeated letters', () => {
    expect(collapseRepeats('vasianndreu89')).toBe('vasiandreu89');
  });

  it('ranks exact and prefix matches best', () => {
    expect(usernameSearchRank('vasianndreu89', 'vasianndreu89')).toBe(0);
    expect(usernameSearchRank('vasianndreu89', 'vasian')).toBe(1);
  });

  it('finds double-letter typo: vasiandreu89 → vasianndreu89', () => {
    const rank = usernameSearchRank('vasianndreu89', 'vasiandreu89');
    expect(rank).not.toBeNull();
    expect(rank!).toBeLessThanOrEqual(4);
  });

  it('rejects unrelated usernames', () => {
    expect(usernameSearchRank('kai_build', 'vasiandreu89')).toBeNull();
  });

  it('levenshtein respects max', () => {
    expect(levenshtein('kitten', 'sitting', 2)).toBe(3);
    expect(levenshtein('abc', 'abc', 2)).toBe(0);
  });
});
