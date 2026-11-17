/**
 * Wave 3 — mentions (migration 0039).
 *
 * GET /mentions/suggest?q=<prefix> → { users: [{ id, username, display_name, avatar_url }] }
 *   Username prefix match (case-insensitive, leading '@' ignored), friends first,
 *   then everyone else; max 8; excludes self and anyone with a block either way.
 *
 * Mention / tag storage + notifications live in utils/mentions.ts (called from
 * createPost and createComment).
 */
import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';

const SUGGEST_LIMIT = 8;
const CANDIDATE_POOL = 40;

const suggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((s) => s.replace(/^@+/, '').toLowerCase())
    .pipe(z.string().max(30).regex(/^[a-z0-9_.]*$/)),
});

export type MentionSuggestion = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function toSuggestion(row: { id: string; metadata: string | null }): MentionSuggestion | null {
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(row.metadata || '{}') || {};
  } catch {
    meta = {};
  }
  const username = typeof meta.username === 'string' ? meta.username.trim() : '';
  if (!username) return null;
  const displayName =
    (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    username;
  return {
    id: row.id,
    username,
    display_name: displayName,
    avatar_url: typeof meta.avatar === 'string' && meta.avatar ? meta.avatar : null,
  };
}

const USERNAME_EXPR = `lower(json_extract(u.metadata, '$.username'))`;
/** Prefix as an index-friendly range: [q, q + U+FFFF). */
function prefixRange(q: string): [string, string] {
  return [q, `${q}\uffff`];
}

async function suggest(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const url = new URL(request.url);
  const parsed = suggestQuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) return json({ users: [] });
  const q = parsed.data.q;
  const me = ctx.userId;

  try {
    const [lo, hi] = prefixRange(q);
    // Friends whose username starts with q (most recent friendships first).
    const friends = await env.DB.prepare(
      `SELECT u.id, u.metadata FROM users u
       WHERE u.id IN (
         SELECT target_user_id FROM user_relationships WHERE user_id = ? AND type = 'friend'
         UNION
         SELECT user_id FROM user_relationships WHERE target_user_id = ? AND type = 'friend'
       )
         AND ${USERNAME_EXPR} >= ? AND ${USERNAME_EXPR} < ?
         AND NOT EXISTS (
           SELECT 1 FROM user_relationships b WHERE b.type = 'block'
             AND ((b.user_id = ? AND b.target_user_id = u.id) OR (b.user_id = u.id AND b.target_user_id = ?))
         )
       ORDER BY ${USERNAME_EXPR}
       LIMIT ?`
    )
      .bind(me, me, lo, hi, me, me, SUGGEST_LIMIT)
      .all<{ id: string; metadata: string | null }>();

    const out: MentionSuggestion[] = [];
    const seen = new Set<string>([me]);
    for (const row of friends.results || []) {
      const s = toSuggestion(row);
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }

    // Everyone else: needs at least one typed character (no global directory dump).
    if (out.length < SUGGEST_LIMIT && q.length >= 1) {
      const others = await env.DB.prepare(
        `SELECT u.id, u.metadata FROM users u
         WHERE ${USERNAME_EXPR} >= ? AND ${USERNAME_EXPR} < ?
           AND u.id != ?
           AND NOT EXISTS (
             SELECT 1 FROM user_relationships b WHERE b.type = 'block'
               AND ((b.user_id = ? AND b.target_user_id = u.id) OR (b.user_id = u.id AND b.target_user_id = ?))
           )
         ORDER BY ${USERNAME_EXPR}
         LIMIT ?`
      )
        .bind(lo, hi, me, me, me, CANDIDATE_POOL)
        .all<{ id: string; metadata: string | null }>();
      // Shortest (closest to what was typed) first.
      const pool = (others.results || [])
        .map(toSuggestion)
        .filter((s): s is MentionSuggestion => !!s && !seen.has(s.id))
        .sort((a, b) => a.username.length - b.username.length || a.username.localeCompare(b.username));
      for (const s of pool) {
        if (out.length >= SUGGEST_LIMIT) break;
        seen.add(s.id);
        out.push(s);
      }
    }

    return json({ users: out.slice(0, SUGGEST_LIMIT) });
  } catch (err) {
    console.error('[mentions.suggest]', err);
    return error('DATABASE_ERROR', 'Could not load suggestions', 500);
  }
}

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string
): Promise<Response | null> {
  if (path === `${apiPrefix}/mentions/suggest` && request.method === 'GET') {
    return suggest(request, env);
  }
  return null;
}
