/**
 * Wave 3 — Search (FTS5, migration 0038).
 *
 * GET /search?q=&type=all|people|posts|tags&limit=&cursor=
 *   → {
 *       people: [{ id, username, display_name, avatar_url, paths, is_friend }],
 *       posts:  [{ id, thumb_url, caption_snippet, category, created_at,
 *                  author: { id, username, display_name, avatar_url } }],
 *       tags:   [{ tag, count }],
 *       more:   { people, posts, tags },   // a "See all" would show more
 *       next_cursor: string | null          // only for a single type
 *     }
 *
 * - Every query word is a prefix ("yo fl" → "yo"* AND "fl"*). Anything that is not a letter,
 *   digit or underscore is dropped, so FTS syntax (quotes, NEAR, -, :, *, ^) can't be injected.
 * - People rank: exact username, then username prefix, then friends, then bm25
 *   (username ≫ display name > paths > bio).
 * - Posts rank by bm25 (caption > tags > category > subcategory), newer first on ties.
 * - q starting with '#' searches hashtags: tags + posts carrying a matching tag, no people.
 * - Excludes: self (people), blocks in either direction, posts by users the viewer muted,
 *   hidden posts / posts without a public https image (same rule as the feed), and
 *   deleted / banned / currently-suspended accounts.
 * - The old GET /social/search stays untouched for older app builds.
 */
import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';

const ALL_LIMITS = { people: 5, posts: 6, tags: 6 } as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_OFFSET = 500;
const MAX_TOKENS = 6;
const MAX_TOKEN_LEN = 40;
/** How many tagged posts we read to count tags. */
const TAG_SCAN = 400;

const querySchema = z.object({
  q: z.string().max(100).default(''),
  type: z.enum(['all', 'people', 'posts', 'tags']).default('all'),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  cursor: z
    .string()
    .regex(/^\d{1,4}$/)
    .optional(),
});

export type SearchType = z.infer<typeof querySchema>['type'];

// ---------------------------------------------------------------------------
// Query parsing (pure, exported for tests)

/** Lowercase + fold diacritics, same as the unicode61 remove_diacritics tokenizer. */
export function foldText(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/** Words of the query, only [letters digits _], at most MAX_TOKENS, each ≤ MAX_TOKEN_LEN. */
export function queryTokens(q: string): string[] {
  return foldText(q)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean)
    .slice(0, MAX_TOKENS)
    .map((t) => t.slice(0, MAX_TOKEN_LEN));
}

export type ParsedQuery =
  | { kind: 'empty' }
  | { kind: 'text'; tokens: string[]; match: string }
  | { kind: 'tag'; tag: string; match: string };

/** Builds a safe FTS5 MATCH expression. Each token is quoted and prefix-starred. */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.trim();
  if (q.startsWith('#')) {
    const [tag] = queryTokens(q.slice(1));
    if (!tag) return { kind: 'empty' };
    return { kind: 'tag', tag, match: `tags : "ht_${tag}"*` };
  }
  const tokens = queryTokens(q);
  if (!tokens.length) return { kind: 'empty' };
  return { kind: 'text', tokens, match: tokens.map((t) => `"${t}"*`).join(' ') };
}

/** Hashtags in a caption, folded (lowercase, no diacritics), unique per caption. */
export function extractTags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const out = new Set<string>();
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    const t = foldText(m[1]).slice(0, MAX_TOKEN_LEN);
    if (t) out.add(t);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// SQL fragments

/** Author/user `u` is active (alias `st` = LEFT JOIN user_account_states). */
const ACTIVE_ACCOUNT = `(st.status IS NULL
  OR (st.status NOT IN ('deleted', 'deleted_pending', 'banned')
      AND NOT (st.status = 'suspended'
               AND (st.suspended_until IS NULL OR datetime(st.suspended_until) > datetime('now')))))`;

/** No block between viewer (?1) and `u` in either direction. Uses positional ?1. */
const NOT_BLOCKED = `NOT EXISTS (
  SELECT 1 FROM user_relationships b
  WHERE b.type = 'block'
    AND ((b.user_id = ?1 AND b.target_user_id = u.id) OR (b.user_id = u.id AND b.target_user_id = ?1))
)`;

/** Same visibility as the feed: not hidden, public https image, author not muted by viewer. */
const POST_VISIBLE = `COALESCE(p.is_hidden, 0) = 0
  AND p.image_url IS NOT NULL
  AND trim(p.image_url) != ''
  AND p.image_url LIKE 'https://%'
  AND NOT EXISTS (
    SELECT 1 FROM user_relationships m
    WHERE m.user_id = ?1 AND m.target_user_id = u.id AND m.type = 'mute'
  )`;

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function userSummary(id: string, rawMeta: string | null) {
  const meta = parseMeta(rawMeta);
  const username = str(meta.username) || id.slice(0, 8);
  return {
    meta,
    summary: {
      id,
      username,
      display_name: str(meta.display_name) || username,
      avatar_url: str(meta.avatar),
    },
  };
}

function likePrefix(s: string): string {
  return `${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ---------------------------------------------------------------------------
// Section queries

type Page = { offset: number; limit: number };

export type PersonHit = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  paths: string[];
  is_friend: boolean;
};

async function searchPeople(env: Env, viewerId: string, match: string, tokens: string[], page: Page) {
  const whole = tokens.join(' ');
  const rows = await env.DB.prepare(
    `SELECT u.id, u.metadata,
            bm25(search_users, 0.0, 10.0, 6.0, 1.0, 2.0) AS score,
            CASE WHEN lower(s.username) = ?3 THEN 0
                 WHEN lower(s.username) LIKE ?4 ESCAPE '\\' THEN 1
                 ELSE 2 END AS bucket,
            EXISTS (SELECT 1 FROM user_relationships f
                    WHERE f.user_id = ?1 AND f.target_user_id = u.id AND f.type = 'friend') AS is_friend
     FROM search_users s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN user_account_states st ON st.user_id = u.id
     WHERE search_users MATCH ?2
       AND u.id != ?1
       AND ${NOT_BLOCKED}
       AND ${ACTIVE_ACCOUNT}
     ORDER BY bucket, is_friend DESC, score, u.id
     LIMIT ?5 OFFSET ?6`
  )
    .bind(viewerId, match, whole, likePrefix(tokens[0]), page.limit + 1, page.offset)
    .all<{ id: string; metadata: string | null; is_friend: number }>();
  const list = rows.results || [];
  const people: PersonHit[] = list.slice(0, page.limit).map((r) => {
    const { meta, summary } = userSummary(r.id, r.metadata);
    return {
      ...summary,
      paths: Array.isArray(meta.categories) ? meta.categories.map((x) => String(x)) : [],
      is_friend: Number(r.is_friend) > 0,
    };
  });
  return { people, more: list.length > page.limit };
}

export type PostHit = {
  id: string;
  thumb_url: string | null;
  caption_snippet: string;
  category: string;
  created_at: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null };
};

async function searchPosts(env: Env, viewerId: string, match: string, page: Page) {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.image_url, p.metadata AS post_meta, p.category, p.created_at,
            u.id AS author_id, u.metadata AS author_meta,
            snippet(search_posts, 1, '', '', '…', 16) AS snip,
            bm25(search_posts, 0.0, 4.0, 1.5, 1.0, 3.0) AS score
     FROM search_posts s
     JOIN posts p ON p.id = s.post_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN user_account_states st ON st.user_id = u.id
     WHERE search_posts MATCH ?2
       AND ${POST_VISIBLE}
       AND ${NOT_BLOCKED}
       AND ${ACTIVE_ACCOUNT}
     ORDER BY score, p.created_at DESC, p.id
     LIMIT ?3 OFFSET ?4`
  )
    .bind(viewerId, match, page.limit + 1, page.offset)
    .all<{
      id: string;
      image_url: string | null;
      post_meta: string | null;
      category: string;
      created_at: string;
      author_id: string;
      author_meta: string | null;
      snip: string | null;
    }>();
  const list = rows.results || [];
  const posts: PostHit[] = list.slice(0, page.limit).map((r) => {
    const pm = parseMeta(r.post_meta);
    return {
      id: r.id,
      thumb_url: str(pm.thumbnail_url) || str(pm.thumb_url) || r.image_url,
      caption_snippet: (r.snip || '').trim(),
      category: r.category,
      created_at: r.created_at,
      author: userSummary(r.author_id, r.author_meta).summary,
    };
  });
  return { posts, more: list.length > page.limit };
}

/** Tags starting with `prefix`, counted over the most recent visible posts that carry them. */
async function searchTags(env: Env, viewerId: string, prefix: string, page: Page) {
  const rows = await env.DB.prepare(
    `SELECT p.caption
     FROM search_posts s
     JOIN posts p ON p.id = s.post_id
     JOIN users u ON u.id = p.user_id
     LEFT JOIN user_account_states st ON st.user_id = u.id
     WHERE search_posts MATCH ?2
       AND ${POST_VISIBLE}
       AND ${NOT_BLOCKED}
       AND ${ACTIVE_ACCOUNT}
     ORDER BY p.created_at DESC
     LIMIT ?3`
  )
    .bind(viewerId, `tags : "ht_${prefix}"*`, TAG_SCAN)
    .all<{ caption: string | null }>();
  const counts = new Map<string, number>();
  for (const r of rows.results || []) {
    for (const t of extractTags(r.caption)) {
      if (t.startsWith(prefix)) counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const sorted = [...counts.entries()]
    .sort((a, b) => (a[0] === prefix ? -1 : b[0] === prefix ? 1 : 0) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));
  const tags = sorted.slice(page.offset, page.offset + page.limit);
  return { tags, more: sorted.length > page.offset + page.limit };
}

// ---------------------------------------------------------------------------

export async function search(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const url = new URL(request.url);
  const parsedParams = querySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    type: (url.searchParams.get('type') || 'all').toLowerCase(),
    limit: url.searchParams.get('limit') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
  });
  if (!parsedParams.success) {
    return error('VALIDATION_ERROR', 'Invalid search parameters', 400, parsedParams.error.flatten());
  }
  const { q, type, limit, cursor } = parsedParams.data;
  const offset = Math.min(cursor ? parseInt(cursor, 10) : 0, MAX_OFFSET);
  const query = parseQuery(q);

  const out = {
    people: [] as PersonHit[],
    posts: [] as PostHit[],
    tags: [] as Array<{ tag: string; count: number }>,
    more: { people: false, posts: false, tags: false },
    next_cursor: null as string | null,
  };
  if (query.kind === 'empty') return json(out);

  const single = type !== 'all';
  const pageFor = (section: keyof typeof ALL_LIMITS): Page =>
    single
      ? { offset, limit: limit ?? DEFAULT_LIMIT }
      : { offset: 0, limit: Math.min(limit ?? ALL_LIMITS[section], 10) };
  const want = (section: SearchType) => type === 'all' || type === section;
  const viewer = ctx.userId;

  try {
    const tasks: Promise<void>[] = [];
    if (want('people') && query.kind === 'text') {
      tasks.push(
        searchPeople(env, viewer, query.match, query.tokens, pageFor('people')).then((r) => {
          out.people = r.people;
          out.more.people = r.more;
        })
      );
    }
    if (want('posts')) {
      const match = query.kind === 'tag' ? query.match : `{caption category subcategory} : (${query.match})`;
      tasks.push(
        searchPosts(env, viewer, match, pageFor('posts')).then((r) => {
          out.posts = r.posts;
          out.more.posts = r.more;
        })
      );
    }
    // Tags: always for '#' queries; for plain text only when it's a single word.
    const tagPrefix = query.kind === 'tag' ? query.tag : query.tokens.length === 1 ? query.tokens[0] : null;
    if (want('tags') && tagPrefix) {
      tasks.push(
        searchTags(env, viewer, tagPrefix, pageFor('tags')).then((r) => {
          out.tags = r.tags;
          out.more.tags = r.more;
        })
      );
    }
    await Promise.all(tasks);
    if (single && out.more[type as keyof typeof out.more]) {
      const next = offset + (limit ?? DEFAULT_LIMIT);
      out.next_cursor = next <= MAX_OFFSET ? String(next) : null;
    }
    return json(out);
  } catch (err) {
    console.error('[search]', err);
    return error('DATABASE_ERROR', 'Failed to search', 500);
  }
}

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (path === `${apiPrefix}/search` && request.method === 'GET') {
    return search(request, env);
  }
  return null;
}
