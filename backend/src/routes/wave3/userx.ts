import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { localDay, localDayOf, safeTimeZone, sqlDateTime, weekStart } from '../../utils/days';
import { mutedJournalIdsFromMetadata } from '../journal';

/** Max faces / moments in the Sunday circle recap. */
export const CIRCLE_WEEK_MAX_MEMBERS = 8;
export const CIRCLE_WEEK_MAX_MOMENTS = 6;

/**
 * Wave 4 route module (userx — main user). Return a Response for owned paths, else null.
 *
 *   GET    {api}/me/circle/week    → Sunday circle recap ("share one moment to see everyone's week")
 *   DELETE {api}/feed/posts/:postId → author deletes their own post (hard delete + children)
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (request.method === 'GET' && path === `${apiPrefix}/me/circle/week`) {
    return circleWeek(request, env);
  }
  if (request.method === 'DELETE') {
    const m = path.match(new RegExp(`^${apiPrefix}/feed/posts/([^/]+)$`));
    if (m) return deleteOwnPost(request, env, decodeURIComponent(m[1]));
  }
  return null;
}

/** Runs a cleanup statement, ignoring tables that don't exist on older databases. */
async function runOptional(env: Env, sql: string, ...args: unknown[]): Promise<void> {
  try {
    await env.DB.prepare(sql).bind(...args).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('no such table') && !msg.includes('no such column')) throw err;
  }
}

/**
 * DELETE /feed/posts/:postId — the author removes their post for everyone.
 * Hard delete (the FTS search row goes via trigger); likes, comments, comment
 * mentions, @mentions, #tags and notifications pointing at it go too. Media in R2
 * is left in place (no delete helper; the URL is no longer referenced anywhere).
 * Idempotent from the client's view: an already-deleted post → 404.
 */
async function deleteOwnPost(request: Request, env: Env, postId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?')
    .bind(postId)
    .first<{ id: string; user_id: string }>();
  if (!post) return error('POST_NOT_FOUND', 'Post not found', 404);
  if (post.user_id !== ctx.userId) {
    return error('FORBIDDEN', 'You can only delete your own posts', 403);
  }

  try {
    // Children first (D1 enforces FKs; explicit deletes also cover tables without CASCADE).
    await runOptional(env, 'DELETE FROM comment_mentions WHERE post_id = ?', postId);
    await runOptional(env, 'DELETE FROM post_mentions WHERE post_id = ?', postId);
    await runOptional(env, 'DELETE FROM post_tags WHERE post_id = ?', postId);
    await env.DB.prepare('DELETE FROM post_engagement WHERE post_id = ?').bind(postId).run();
    await runOptional(
      env,
      `DELETE FROM user_notifications WHERE ref_id = ? AND (ref_type = 'post' OR type = 'post_like')`,
      postId
    );
    await env.DB.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').bind(postId, ctx.userId).run();
    return json({ deleted: true, id: postId });
  } catch (err) {
    console.error('[deleteOwnPost]', err);
    return error('DATABASE_ERROR', 'Could not delete the post', 500);
  }
}

type Meta = { username?: string; display_name?: string; name?: string; avatar?: string };

function parseMeta(raw: string | null | undefined): Meta {
  try {
    return JSON.parse(raw || '{}') as Meta;
  } catch {
    return {};
  }
}

function displayNameOf(meta: Meta): string {
  return String(meta.display_name || meta.name || meta.username || 'Friend').trim() || 'Friend';
}

function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : '?';
}

function excerpt(text: string, max = 140): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const BLOCK_CLAUSE = (col: string) => `NOT EXISTS (
  SELECT 1 FROM user_relationships b
   WHERE b.type = 'block'
     AND ((b.user_id = ? AND b.target_user_id = ${col})
       OR (b.user_id = ${col} AND b.target_user_id = ?))
)`;

/**
 * GET /me/circle/week
 *
 * The viewer's circle (friend edges, minus blocks) this local week (Mon → today):
 *   { week_start, today, shared, friends_total, friends_active, checkins,
 *     members: [{ id, display_name, initial, avatar, days }],
 *     moments: [{ id, user_id, display_name, avatar, excerpt, mood, created_at }] }
 *
 * Give-to-get, kept light: counts are always returned; faces and moments only once
 * the viewer has shared one moment this week (a shared journal page or a post).
 * Moments are friends' *shared* journal pages only (never private), muted authors skipped.
 */
async function circleWeek(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const userId = ctx.userId;
  const tz = safeTimeZone((ctx.user as unknown as { timezone?: string } | undefined)?.timezone);
  const now = new Date();
  const today = localDay(tz, now);
  const start = weekStart(today);
  // A local week is at most 7 days + a timezone offset of UTC; filter precisely in JS.
  const sinceUtc = sqlDateTime(new Date(now.getTime() - 8 * 86_400_000));
  const inWeek = (ts: string | null | undefined) => {
    const d = localDayOf(ts, tz);
    return !!d && d >= start && d <= today;
  };

  try {
    // 1) Did the viewer share a moment this week?
    const [journalMine, postMine] = await Promise.all([
      env.DB.prepare(
        `SELECT created_at FROM journal_entries
          WHERE user_id = ? AND is_public = 1 AND created_at >= ?
          ORDER BY created_at DESC LIMIT 20`
      )
        .bind(userId, sinceUtc)
        .all<{ created_at: string }>(),
      env.DB.prepare(
        `SELECT created_at FROM posts
          WHERE user_id = ? AND created_at >= ?
          ORDER BY created_at DESC LIMIT 20`
      )
        .bind(userId, sinceUtc)
        .all<{ created_at: string }>()
        .catch(() => ({ results: [] as { created_at: string }[] })),
    ]);
    const shared =
      (journalMine.results || []).some((r) => inWeek(r.created_at)) ||
      (postMine.results || []).some((r) => inWeek(r.created_at));

    // 2) Circle size + who grew this week (activity days are already local days).
    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_relationships r
        WHERE r.user_id = ? AND r.type = 'friend' AND ${BLOCK_CLAUSE('r.target_user_id')}`
    )
      .bind(userId, userId, userId)
      .first<{ n: number }>();
    const friendsTotal = Number(totalRow?.n) || 0;

    let activeRows: { user_id: string; days: number; metadata: string | null }[] = [];
    let checkins = 0;
    if (friendsTotal > 0) {
      const act = await env.DB.prepare(
        `SELECT a.user_id, COUNT(*) AS days, u.metadata
           FROM user_activity_days a
           JOIN user_relationships r
             ON r.user_id = ? AND r.target_user_id = a.user_id AND r.type = 'friend'
           JOIN users u ON u.id = a.user_id
          WHERE a.day >= ? AND a.day <= ? AND (a.kinds > 0 OR a.is_rest = 1)
            AND ${BLOCK_CLAUSE('a.user_id')}
          GROUP BY a.user_id, u.metadata
          ORDER BY days DESC
          LIMIT 64`
      )
        .bind(userId, start, today, userId, userId)
        .all<{ user_id: string; days: number; metadata: string | null }>()
        .catch(() => ({ results: [] as { user_id: string; days: number; metadata: string | null }[] }));
      activeRows = (act.results || []).filter((r) => r.user_id !== userId);

      const ck = await env.DB.prepare(
        `SELECT COUNT(*) AS n
           FROM daily_checkins d
           JOIN user_relationships r
             ON r.user_id = ? AND r.target_user_id = d.user_id AND r.type = 'friend'
          WHERE d.day >= ? AND d.day <= ? AND ${BLOCK_CLAUSE('d.user_id')}`
      )
        .bind(userId, start, today, userId, userId)
        .first<{ n: number }>()
        .catch(() => null);
      checkins = Number(ck?.n) || 0;
    }

    const base = {
      week_start: start,
      today,
      shared,
      friends_total: friendsTotal,
      friends_active: activeRows.length,
      checkins,
    };
    if (!shared || friendsTotal === 0) {
      return json({ ...base, members: [], moments: [] });
    }

    const members = activeRows.slice(0, CIRCLE_WEEK_MAX_MEMBERS).map((r) => {
      const meta = parseMeta(r.metadata);
      const name = displayNameOf(meta);
      return {
        id: r.user_id,
        display_name: name,
        initial: initialOf(name),
        avatar: typeof meta.avatar === 'string' ? meta.avatar : null,
        days: Math.min(7, Number(r.days) || 0),
      };
    });

    // 3) Moments: friends' shared journal pages this week, newest first, one per person
    //    before anyone gets a second.
    const muted = mutedJournalIdsFromMetadata(ctx.user?.metadata);
    const mom = await env.DB.prepare(
      `SELECT j.id, j.user_id, j.content, j.mood, j.created_at, u.metadata
         FROM journal_entries j
         JOIN user_relationships r
           ON r.user_id = ? AND r.target_user_id = j.user_id AND r.type = 'friend'
         JOIN users u ON u.id = j.user_id
        WHERE j.is_public = 1 AND j.created_at >= ?
          AND ${BLOCK_CLAUSE('j.user_id')}
        ORDER BY j.created_at DESC
        LIMIT 60`
    )
      .bind(userId, sinceUtc, userId, userId)
      .all<{ id: string; user_id: string; content: string; mood: string | null; created_at: string; metadata: string | null }>();
    const candidates = (mom.results || []).filter(
      (r) => r.user_id !== userId && !muted.has(r.user_id) && inWeek(r.created_at)
    );
    const firsts: typeof candidates = [];
    const rest: typeof candidates = [];
    const seen = new Set<string>();
    for (const r of candidates) {
      if (seen.has(r.user_id)) rest.push(r);
      else {
        seen.add(r.user_id);
        firsts.push(r);
      }
    }
    const moments = [...firsts, ...rest].slice(0, CIRCLE_WEEK_MAX_MOMENTS).map((r) => {
      const meta = parseMeta(r.metadata);
      return {
        id: r.id,
        user_id: r.user_id,
        display_name: displayNameOf(meta),
        avatar: typeof meta.avatar === 'string' ? meta.avatar : null,
        excerpt: excerpt(r.content),
        mood: r.mood,
        created_at: r.created_at,
      };
    });

    return json({ ...base, members, moments });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) {
      return json({
        week_start: start,
        today,
        shared: false,
        friends_total: 0,
        friends_active: 0,
        checkins: 0,
        members: [],
        moments: [],
      });
    }
    console.error('[circleWeek]', err);
    return error('DATABASE_ERROR', 'Could not load your circle’s week', 500);
  }
}
