import { describe, it, expect } from 'vitest';
import { highlightSegments, queryWords } from './highlight';

const bold = (text: string, q: string) =>
  highlightSegments(text, q)
    .map((s) => (s.match ? `[${s.text}]` : s.text))
    .join('');

describe('highlightSegments', () => {
  it('bolds word prefixes for every query word', () => {
    expect(bold('Morning yoga flow', 'yo fl')).toBe('Morning [yo]ga [fl]ow');
    expect(bold('yoyo', 'yo')).toBe('[yo]yo');
    expect(bold('Bayou', 'yo')).toBe('Bayou');
  });

  it('ignores case, accents and a leading #', () => {
    expect(bold('Café Run', 'cafe')).toBe('[Café] Run');
    expect(bold('#YogaFlow today', '#yoga')).toBe('#[Yoga]Flow today');
    expect(queryWords('  "a" OR b ')).toEqual(['a', 'or', 'b']);
  });

  it('handles empty input', () => {
    expect(highlightSegments('', 'x')).toEqual([]);
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', match: false }]);
  });
});
