import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { localDay, safeTimeZone } from '../../utils/days';
import { unsendMessage } from '../messages';

/** Widget shows at most this many friend dots. */
export const CIRCLE_TODAY_MAX = 8;

/**
 * Wave 3 route module (social). Return a Response for paths this module owns,
 * or null to let the router continue. `path` is the full path incl. the API prefix.
 *
 *   DELETE {api}/messages/conversations/:cid/messages/:mid  → unsend (sender only)
 *   GET    {api}/me/circle/today                             → friends who checked in today
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (request.method === 'DELETE') {
    const m = path.match(new RegExp(`^${apiPrefix}/messages/conversations/([^/]+)/messages/([^/]+)$`));
    if (m) return unsendMessage(request, env, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  }
  if (request.method === 'GET' && path === `${apiPrefix}/me/circle/today`) {
    return circleToday(request, env);
  }
  return null;
}

/** "YYYY-MM-DD HH:MM:SS" (SQLite datetime('now'), UTC) or ISO → Date. */
function parseDbTime(raw: string): Date {
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  return new Date(iso);
}

function initialOf(name: string): string {
  const ch = Array.from(name.trim())[0];
  return ch ? ch.toUpperCase() : '?';
}

/**
 * GET /me/circle/today → { friends: [{ id, display_name, initial, checked_in }] }
 * Friends (mutual friend edge, not blocked either way) whose check-in happened during
 * the viewer's local today (users.timezone). Newest check-in first, max 8.
 */
async function circleToday(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  const userId = ctx.userId;
  const tz = safeTimeZone((ctx.user as unknown as { timezone?: string } | undefined)?.timezone);
  const now = new Date();
  const today = localDay(tz, now);
  // A local day spans at most ~26h of UTC either side of now; take a 48h window then
  // keep only check-ins whose instant falls on the viewer's local today.
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);

  try {
    const rows = await env.DB.prepare(
      `SELECT d.user_id, MAX(d.created_at) AS at, u.metadata
         FROM daily_checkins d
         JOIN user_relationships r
           ON r.user_id = ? AND r.target_user_id = d.user_id AND r.type = 'friend'
         JOIN users u ON u.id = d.user_id
        WHERE d.created_at >= ?
          AND NOT EXISTS (
            SELECT 1 FROM user_relationships b
             WHERE b.type = 'block'
               AND ((b.user_id = ? AND b.target_user_id = d.user_id)
                 OR (b.user_id = d.user_id AND b.target_user_id = ?))
          )
        GROUP BY d.user_id, u.metadata
        ORDER BY at DESC
        LIMIT 64`
    )
      .bind(userId, since, userId, userId)
      .all<{ user_id: string; at: string; metadata: string | null }>();

    const friends: { id: string; display_name: string; initial: string; checked_in: boolean }[] = [];
    for (const r of rows.results || []) {
      if (r.user_id === userId) continue;
      if (localDay(tz, parseDbTime(r.at)) !== today) continue;
      let meta: { username?: string; display_name?: string; name?: string } = {};
      try {
        meta = JSON.parse(r.metadata || '{}');
      } catch {
        /* keep defaults */
      }
      const displayName = (meta.display_name || meta.name || meta.username || 'Friend').toString();
      friends.push({ id: r.user_id, display_name: displayName, initial: initialOf(displayName), checked_in: true });
      if (friends.length >= CIRCLE_TODAY_MAX) break;
    }
    return json({ friends });
  } catch (err) {
    console.error('[circleToday]', err);
    return error('DATABASE_ERROR', 'Could not load your circle', 500);
  }
}
