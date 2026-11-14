/**
 * Personal settings: DM privacy (GET/PUT /me/privacy) and life mode
 * (GET/PUT /me/life-mode). Both live on the users row (migration 0036).
 */
import type { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { validateRequest, lifeModeSchema, privacySettingsSchema } from '../utils/validation';
import { isDayKey, localDay, safeTimeZone } from '../utils/days';
import { getStreakState } from '../utils/activity';
import { lifeModePayload, maxLifeModeUntil, parseLifeMode } from '../utils/lifeMode';
import { parseDmPolicy } from '../utils/dmPolicy';

type Me = { userId: string; user: Record<string, unknown> };

async function requireMe(request: Request, env: Env): Promise<Me | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  return { userId: ctx.userId, user: ctx.user as unknown as Record<string, unknown> };
}

/** GET /me/privacy → { dm_policy } */
export async function getPrivacy(request: Request, env: Env): Promise<Response> {
  const me = await requireMe(request, env);
  if (me instanceof Response) return me;
  return json({ dm_policy: parseDmPolicy(me.user.dm_policy) });
}

/** PUT /me/privacy { dm_policy } → { dm_policy } */
export async function putPrivacy(request: Request, env: Env): Promise<Response> {
  const me = await requireMe(request, env);
  if (me instanceof Response) return me;
  const v = await validateRequest(request, privacySettingsSchema);
  if (!v.success) return v.response;
  try {
    await env.DB.prepare(`UPDATE users SET dm_policy = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(v.data.dm_policy, me.userId)
      .run();
  } catch (err) {
    console.error('[putPrivacy]', err);
    return error('DATABASE_ERROR', 'Could not save your privacy settings', 500);
  }
  return json({ dm_policy: v.data.dm_policy });
}

/** GET /me/life-mode → { mode, until } ('none' once expired) */
export async function getLifeMode(request: Request, env: Env): Promise<Response> {
  const me = await requireMe(request, env);
  if (me instanceof Response) return me;
  const today = localDay(safeTimeZone(me.user.timezone));
  return json(lifeModePayload(parseLifeMode(me.user), today));
}

/** PUT /me/life-mode { mode, until? } → { mode, until } */
export async function putLifeMode(request: Request, env: Env): Promise<Response> {
  const me = await requireMe(request, env);
  if (me instanceof Response) return me;
  const v = await validateRequest(request, lifeModeSchema);
  if (!v.success) return v.response;

  // Settle the streak through yesterday under the current mode first, so days the
  // old mode protected are persisted before the window changes.
  const got = await getStreakState(env, me.userId);
  if (!got) return error('NOT_FOUND', 'User not found', 404);
  const today = got.today;

  const { mode } = v.data;
  let until: string | null = null;
  let since: string | null = null;
  if (mode !== 'none') {
    until = v.data.until ?? null;
    if (until !== null) {
      if (!isDayKey(until) || until < today) {
        return error('VALIDATION_ERROR', 'Pick today or a later date.', 400);
      }
      if (until > maxLifeModeUntil(today)) {
        return error('VALIDATION_ERROR', 'Pick a date within the next 30 days.', 400);
      }
    }
    const current = lifeModePayload(got.lifeMode, today);
    since = current.mode !== 'none' && got.lifeMode.since ? got.lifeMode.since : today;
  }

  try {
    await env.DB.prepare(
      `UPDATE users SET life_mode = ?, life_mode_since = ?, life_mode_until = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(mode, since, until, me.userId)
      .run();
  } catch (err) {
    console.error('[putLifeMode]', err);
    return error('DATABASE_ERROR', 'Could not save life mode', 500);
  }
  return json({ mode, until });
}
