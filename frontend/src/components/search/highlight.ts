/**
 * Splits `text` into plain / matched segments for bolding search hits. A segment matches when
 * a word in the text starts with one of the query's words — the same prefix rule the server
 * uses — ignoring case and accents ("cafe" bolds "Café").
 */
export type HighlightSegment = { text: string; match: boolean };

function fold(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function queryWords(query: string): string[] {
  return fold(query.replace(/^\s*#/, ''))
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .slice(0, 6);
}

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const words = queryWords(query);
  if (!text || !words.length) return text ? [{ text, match: false }] : [];
  const out: HighlightSegment[] = [];
  const push = (t: string, match: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += t;
    else out.push({ text: t, match });
  };
  // Word-ish runs (letters, digits, underscore, combining marks) vs everything else.
  const re = /[\p{L}\p{N}\p{M}_]+/gu;
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    push(text.slice(cursor, start), false);
    const word = m[0];
    const folded = fold(word);
    const hit = words
      .filter((w) => folded.startsWith(w))
      .sort((a, b) => b.length - a.length)[0];
    if (hit) {
      // Map the folded prefix length back onto the original characters.
      let n = 0;
      let i = 0;
      while (i < word.length && n < hit.length) {
        const ch = String.fromCodePoint(word.codePointAt(i)!);
        n += fold(ch).length;
        i += ch.length;
      }
      while (i < word.length && /\p{M}/u.test(word[i])) i += 1;
      push(word.slice(0, i), true);
      push(word.slice(i), false);
    } else {
      push(word, false);
    }
    cursor = start + word.length;
  }
  push(text.slice(cursor), false);
  return out;
}
