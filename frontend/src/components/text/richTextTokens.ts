/**
 * Pure tokenizer for captions / comments: @mentions, #tags and links.
 * Rules mirror backend/src/utils/mentions.ts so what renders as a mention is
 * what the server notified:
 *   @username — [A-Za-z0-9_.] 2–30, not after a word char / '.' / '@' / '/'
 *               (emails and URLs aren't mentions); edge dots are punctuation.
 *   #tag      — unicode letters / marks / digits / _ 2–40 with ≥ 1 letter, not
 *               after a word char / '&' / '#' / '/'.
 *   links     — http(s):// or www., trailing punctuation left as text.
 */

export type RichToken =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; username: string }
  | { type: 'tag'; text: string; tag: string }
  | { type: 'link'; text: string; url: string };

/** Unicode property escapes where the engine supports them; a broad BMP fallback otherwise. */
const UNICODE = (() => {
  try {
    return new RegExp('\\p{L}', 'u').test('é');
  } catch {
    return false;
  }
})();

const WORD = UNICODE
  ? '\\p{L}\\p{M}\\p{N}_'
  : 'A-Za-z0-9_\\u00C0-\\u024F\\u0300-\\u036F\\u0370-\\u03FF\\u0400-\\u04FF\\u0590-\\u05FF\\u0600-\\u06FF\\u0900-\\u097F\\u3040-\\u30FF\\u3400-\\u9FFF\\uAC00-\\uD7AF';
const FLAGS = UNICODE ? 'gu' : 'g';
const HAS_LETTER = UNICODE ? new RegExp('\\p{L}', 'u') : /[^0-9_]/;

const URL_SRC = '(https?:\\/\\/[^\\s<>]+|www\\.[^\\s<>]+)';
const MENTION_SRC = `(^|[^${WORD}.@/])@([A-Za-z0-9_.]{2,32})(?![A-Za-z0-9_.@])`;
const TAG_SRC = `(^|[^${WORD}&#/])#([${WORD}]{2,40})(?![${WORD}])`;

const USERNAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.]{1,29}$/;
const TRAILING_URL_PUNCT = /[.,!?;:'")\]]+$/;

function push(out: RichToken[], token: RichToken) {
  if (token.type === 'text') {
    if (!token.text) return;
    const last = out[out.length - 1];
    if (last && last.type === 'text') {
      last.text += token.text;
      return;
    }
  }
  out.push(token);
}

export function tokenizeRichText(input: string | null | undefined): RichToken[] {
  const text = input ?? '';
  const out: RichToken[] = [];
  if (!text) return out;
  const re = new RegExp(`${URL_SRC}|${MENTION_SRC}|${TAG_SRC}`, FLAGS);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0] === '') {
      re.lastIndex += 1;
      continue;
    }
    push(out, { type: 'text', text: text.slice(last, m.index) });
    last = m.index + m[0].length;

    if (m[1] !== undefined) {
      // Link — keep closing punctuation outside.
      const raw = m[1];
      const trail = raw.match(TRAILING_URL_PUNCT)?.[0] ?? '';
      const linkText = trail ? raw.slice(0, raw.length - trail.length) : raw;
      if (linkText.length > (linkText.startsWith('www.') ? 4 : 8)) {
        push(out, {
          type: 'link',
          text: linkText,
          url: /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`,
        });
        push(out, { type: 'text', text: trail });
      } else {
        push(out, { type: 'text', text: raw });
      }
      continue;
    }

    if (m[3] !== undefined) {
      push(out, { type: 'text', text: m[2] ?? '' });
      const raw = m[3];
      const lead = raw.match(/^\.+/)?.[0] ?? '';
      const trail = raw.slice(lead.length).match(/\.+$/)?.[0] ?? '';
      const name = raw.slice(lead.length, raw.length - trail.length);
      if (!lead && USERNAME_RE.test(name)) {
        push(out, { type: 'mention', text: `@${name}`, username: name });
        push(out, { type: 'text', text: trail });
      } else {
        push(out, { type: 'text', text: `@${raw}` });
      }
      continue;
    }

    // Tag.
    push(out, { type: 'text', text: m[4] ?? '' });
    const tag = m[5] ?? '';
    if (HAS_LETTER.test(tag)) {
      push(out, { type: 'tag', text: `#${tag}`, tag: tag.toLowerCase() });
    } else {
      push(out, { type: 'text', text: `#${tag}` });
    }
  }
  push(out, { type: 'text', text: text.slice(last) });
  return out;
}

/** The @query being typed at `cursor`, or null. `start` is the index of '@'. */
export function activeMentionQuery(
  text: string,
  cursor: number
): { query: string; start: number; end: number } | null {
  const end = Math.max(0, Math.min(cursor, text.length));
  let i = end - 1;
  while (i >= 0 && /[A-Za-z0-9_.]/.test(text[i])) i -= 1;
  if (i < 0 || text[i] !== '@') return null;
  const before = i > 0 ? text[i - 1] : '';
  if (before && !/[\s([{"'“‘,;:!?]/.test(before)) return null;
  const query = text.slice(i + 1, end);
  if (query.length > 30 || query.startsWith('.')) return null;
  return { query, start: i, end };
}

/** Replace the active @query with `@username ` → { text, cursor }. */
export function insertMention(
  text: string,
  active: { start: number; end: number },
  username: string
): { text: string; cursor: number } {
  const after = text.slice(active.end).replace(/^[A-Za-z0-9_.]*/, '');
  const insert = `@${username} `;
  const rest = after.startsWith(' ') ? after.slice(1) : after;
  return { text: text.slice(0, active.start) + insert + rest, cursor: active.start + insert.length };
}
