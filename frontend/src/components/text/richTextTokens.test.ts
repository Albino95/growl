import { describe, it, expect } from 'vitest';
import { tokenizeRichText, activeMentionQuery, insertMention, type RichToken } from './richTextTokens';

const kinds = (t: RichToken[]) => t.map((x) => `${x.type}:${x.text}`);

describe('tokenizeRichText', () => {
  it('returns plain text untouched', () => {
    expect(tokenizeRichText('just a run')).toEqual([{ type: 'text', text: 'just a run' }]);
    expect(tokenizeRichText('')).toEqual([]);
    expect(tokenizeRichText(null)).toEqual([]);
  });

  it('finds mentions with punctuation around them', () => {
    expect(kinds(tokenizeRichText('run with @Lea, @max_2! (@sam.k) thanks @tom.'))).toEqual([
      'text:run with ',
      'mention:@Lea',
      'text:, ',
      'mention:@max_2',
      'text:! (',
      'mention:@sam.k',
      'text:) thanks ',
      'mention:@tom',
      'text:.',
    ]);
    const m = tokenizeRichText('@Lea')[0];
    expect(m).toEqual({ type: 'mention', text: '@Lea', username: 'Lea' });
  });

  it('does not treat emails, URL paths or short / long names as mentions', () => {
    expect(kinds(tokenizeRichText('mail lea@example.com'))).toEqual(['text:mail lea@example.com']);
    expect(kinds(tokenizeRichText('@a and @' + 'x'.repeat(31)))).toEqual([
      'text:@a and @' + 'x'.repeat(31),
    ]);
    expect(tokenizeRichText('@.lea').every((t) => t.type === 'text')).toBe(true);
  });

  it('finds unicode tags, lowercases the tag, skips numbers and fragments', () => {
    const t = tokenizeRichText('#MorningRun #café #2024 a#b x&#39;');
    expect(t.filter((x) => x.type === 'tag')).toEqual([
      { type: 'tag', text: '#MorningRun', tag: 'morningrun' },
      { type: 'tag', text: '#café', tag: 'café' },
    ]);
    expect(t.map((x) => x.text).join('')).toBe('#MorningRun #café #2024 a#b x&#39;');
  });

  it('finds links and leaves trailing punctuation and fragments alone', () => {
    const t = tokenizeRichText('see https://grow.app/p#top, or www.example.com.');
    expect(kinds(t)).toEqual([
      'text:see ',
      'link:https://grow.app/p#top',
      'text:, or ',
      'link:www.example.com',
      'text:.',
    ]);
    expect(t[3]).toMatchObject({ url: 'https://www.example.com' });
    expect(kinds(tokenizeRichText('https://x.com/@lea'))).toEqual(['link:https://x.com/@lea']);
  });

  it('round-trips the full text', () => {
    const s = 'Day 3 🌱 with @lea & @max.\n#yoga #30DaysOfYoga https://a.b/c?d=1 done.';
    expect(tokenizeRichText(s).map((x) => x.text).join('')).toBe(s);
  });
});

describe('activeMentionQuery / insertMention', () => {
  it('detects the @query at the cursor', () => {
    expect(activeMentionQuery('hi @le', 6)).toEqual({ query: 'le', start: 3, end: 6 });
    expect(activeMentionQuery('@', 1)).toEqual({ query: '', start: 0, end: 1 });
    expect(activeMentionQuery('(@le', 4)).toEqual({ query: 'le', start: 1, end: 4 });
  });

  it('ignores emails, finished mentions and long queries', () => {
    expect(activeMentionQuery('lea@ex', 6)).toBeNull();
    expect(activeMentionQuery('@lea ', 5)).toBeNull();
    expect(activeMentionQuery('@' + 'x'.repeat(31), 32)).toBeNull();
    expect(activeMentionQuery('no mention', 10)).toBeNull();
  });

  it('inserts @username + space and places the cursor after it', () => {
    const text = 'hi @le and more';
    const a = activeMentionQuery(text, 6)!;
    expect(insertMention(text, a, 'lea_k')).toEqual({ text: 'hi @lea_k and more', cursor: 10 });
    const b = activeMentionQuery('@l', 2)!;
    expect(insertMention('@l', b, 'lea')).toEqual({ text: '@lea ', cursor: 5 });
  });
});
