import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { deleteUserProofMedia } from './wave3/proofx';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function exportUserDataPayload(env: Env, userId: string) {
  const user = await env.DB.prepare(
    `SELECT id, email, points, is_instructor, is_business, metadata, created_at FROM users WHERE id = ?`
  )
    .bind(userId)
    .first<any>();
  if (!user) return null;

  const [posts, comments, orders, reports, growth] = await Promise.all([
    env.DB.prepare(`SELECT * FROM posts WHERE user_id = ?`).bind(userId).all(),
    env.DB.prepare(
      `SELECT id, post_id, content, created_at FROM post_engagement WHERE user_id = ? AND type = 'comment'`
    ).bind(userId).all(),
    env.DB.prepare(`SELECT * FROM orders WHERE user_id = ?`).bind(userId).all(),
    // Only reports this user filed — never expose who reported them.
    env.DB.prepare(
      `SELECT id, target_id, target_type, reason, status, created_at FROM reports WHERE reporter_id = ?`
    )
      .bind(userId)
      .all(),
    exportGrowthData(env, userId),
  ]);

  return {
    user: { ...user, metadata: parseJson(user.metadata, {}) },
    posts: posts.results || [],
    comments: comments.results || [],
    orders: orders.results || [],
    reports: reports.results || [],
    growth,
    exported_at: new Date().toISOString(),
  };
}

/** Growth system data: check-ins, badges, activity days, streak, challenges, invites. */
async function exportGrowthData(env: Env, userId: string) {
  try {
    const [checkins, badges, days, streak, challenges, invites] = await Promise.all([
      env.DB.prepare(
        `SELECT day, tz, mood, path, intention, rest, followup, created_at, updated_at
         FROM daily_checkins WHERE user_id = ? ORDER BY day`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(`SELECT badge_id, earned_at, seen_at FROM user_badges WHERE user_id = ? ORDER BY earned_at`)
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT day, kinds, paths, is_rest FROM user_activity_days WHERE user_id = ? ORDER BY day`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT current, longest, total_days, rest_tokens, last_active_day FROM user_streaks WHERE user_id = ?`
      )
        .bind(userId)
        .first(),
      env.DB.prepare(
        `SELECT challenge_id, joined_at, ends_at, completed_at FROM challenge_participants WHERE user_id = ?`
      )
        .bind(userId)
        .all(),
      // Only whether/when this user joined via an invite and how many joined via theirs.
      env.DB.prepare(
        `SELECT 'joined_via_invite' AS kind, created_at, status FROM invite_redemptions WHERE invitee_id = ?
         UNION ALL
         SELECT 'invited_someone', created_at, status FROM invite_redemptions WHERE inviter_id = ?`
      )
        .bind(userId, userId)
        .all(),
    ]);
    return {
      checkins: checkins.results || [],
      badges: badges.results || [],
      activity_days: days.results || [],
      streak: streak || null,
      challenges: challenges.results || [],
      invites: invites.results || [],
    };
  } catch (err) {
    console.error('[privacy] growth export failed', err);
    return null;
  }
}

/** GET /api/v1/privacy/export — download a copy of the authenticated user's data */
export async function exportAccountData(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const payload = await exportUserDataPayload(env, ctx.userId);
  if (!payload) {
    return error('NOT_FOUND', 'User not found', 404);
  }

  const requestId = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, 'export', 'completed', ?, datetime('now'), datetime('now'))`
  )
    .bind(requestId, ctx.userId, JSON.stringify({ selfService: true }))
    .run();

  return json(payload);
}

/** POST /api/v1/privacy/delete-account — request account deletion (soft-delete workflow) */
export async function deleteAccount(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return error('METHOD_NOT_ALLOWED', 'Use POST', 405);
  }

  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { confirm?: string } = {};
  try {
    body = await request.json();
  } catch {
    // confirmation is optional but recommended
  }
  if (body.confirm && body.confirm !== 'DELETE') {
    return error('VALIDATION_ERROR', 'Type DELETE to confirm account deletion', 400);
  }

  const requestId = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, 'delete', 'pending', ?, datetime('now'), datetime('now'))`
  )
    .bind(requestId, ctx.userId, JSON.stringify({ selfService: true }))
    .run();

  await scrubUserForDeletion(env, ctx.userId);

  return json({
    ok: true,
    message: 'Your account has been scheduled for deletion. You have been signed out.',
    requestId,
  });
}

/**
 * Immediate part of account deletion (self-service and admin-approved): mark the account
 * deleted_pending, anonymise PII, drop free-text check-ins and private proof media/rows.
 * The hourly purge (routes/admin/privacy.ts runPrivacyPurge) hard-deletes after the grace period.
 */
export async function scrubUserForDeletion(env: Env, userId: string, adminId?: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_account_states (user_id, status, updated_by_admin_id, updated_at)
     VALUES (?, 'deleted_pending', ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET status = 'deleted_pending', updated_at = datetime('now')`
  )
    .bind(userId, adminId || null)
    .run();
  // Grace-period clock (migration 0051). Kept separate so an older schema still deletes.
  try {
    await env.DB.prepare(
      `UPDATE user_account_states SET deletion_requested_at = COALESCE(deletion_requested_at, datetime('now'))
       WHERE user_id = ?`
    )
      .bind(userId)
      .run();
  } catch (err) {
    console.error('[deleteAccount] deletion_requested_at', err);
  }

  // Anonymize PII immediately; the purge job finalizes the hard delete later.
  const anonymizedEmail = `deleted+${userId}@growl.invalid`;
  await env.DB.prepare(
    `UPDATE users SET email = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(anonymizedEmail, JSON.stringify({ deleted: true, deletedAt: new Date().toISOString() }), userId)
    .run();

  // Growth data: free-text check-ins go now and the invite link stops working.
  // Everything else is removed by ON DELETE CASCADE when the row is hard-deleted.
  try {
    await env.DB.prepare(`UPDATE users SET invite_code = NULL WHERE id = ?`).bind(userId).run();
    await env.DB.prepare(`DELETE FROM daily_checkins WHERE user_id = ?`).bind(userId).run();
  } catch (err) {
    console.error('[deleteAccount] growth cleanup failed', err);
  }

  // Proof of progress: private files go now, then the rows (free text) with them.
  try {
    await deleteUserProofMedia(env, userId);
    await env.DB.prepare(`DELETE FROM proof_cheers WHERE proof_id IN (SELECT id FROM proofs WHERE user_id = ?)`)
      .bind(userId)
      .run();
    await env.DB.prepare(`DELETE FROM proofs WHERE user_id = ?`).bind(userId).run();
  } catch (err) {
    console.error('[deleteAccount] proof cleanup failed', err);
  }
}

/** Public media folders written by routes/media.ts as `<purpose>/<userId>/…` (proof/ handled above). */
const USER_MEDIA_PREFIXES = ['post', 'reel', 'story', 'avatar', 'product'];

async function deleteR2Prefix(env: Env, prefix: string): Promise<number> {
  if (!env.R2) return 0;
  let cursor: string | undefined;
  let deleted = 0;
  for (let page = 0; page < 20; page++) {
    const listed = await env.R2.list({ prefix, limit: 500, cursor });
    const keys = (listed.objects || []).map((o) => o.key).filter((k) => k.startsWith(prefix));
    if (keys.length) {
      await env.R2.delete(keys);
      deleted += keys.length;
    }
    if (!listed.truncated || !('cursor' in listed) || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return deleted;
}

/**
 * Rows keyed by user id without a FOREIGN KEY to users (no cascade). Deleted explicitly,
 * each best-effort so a table missing in one environment does not stop the purge.
 */
const NO_CASCADE_CLEANUP: string[] = [
  `DELETE FROM search_posts WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?1)`,
  `DELETE FROM search_users WHERE user_id = ?1`,
  `DELETE FROM post_mentions WHERE mentioned_user_id = ?1 OR author_id = ?1`,
  `DELETE FROM comment_mentions WHERE mentioned_user_id = ?1 OR author_id = ?1`,
  `DELETE FROM growth_seed_events WHERE actor_user_id = ?1`,
  `DELETE FROM growth_seed_members WHERE user_id = ?1`,
  `DELETE FROM growth_seeds WHERE planted_by_user_id = ?1
     AND NOT EXISTS (SELECT 1 FROM growth_seed_members m WHERE m.seed_id = growth_seeds.id)`,
  `DELETE FROM growth_group_members WHERE user_id = ?1`,
  `DELETE FROM growth_group_pulses WHERE user_id = ?1`,
  `DELETE FROM growth_group_call_interest WHERE user_id = ?1`,
  `DELETE FROM idempotency_keys WHERE user_id = ?1`,
  `DELETE FROM coach_weekly_sent WHERE user_id = ?1`,
  `DELETE FROM weekly_nudges WHERE user_id = ?1`,
  `DELETE FROM partner_link_clicks WHERE user_id = ?1`,
  `DELETE FROM partner_save_attributions WHERE user_id = ?1`,
  `UPDATE biz_events SET viewer_id = NULL WHERE viewer_id = ?1`,
  // orders.business_id references users without ON DELETE: detach so the delete can proceed.
  `UPDATE orders SET business_id = NULL WHERE business_id = ?1`,
];

/**
 * Final step of account deletion, run by the purge job after the grace period:
 * removes media in R2 (incl. proof/), rows without cascade, then the users row
 * (everything else cascades). If the delete is refused, the account is fully
 * anonymised instead and marked 'deleted' so it is not picked up again.
 */
export async function hardDeleteUser(env: Env, userId: string): Promise<'deleted' | 'anonymised'> {
  await scrubUserForDeletion(env, userId);
  if (env.R2 && userId && !userId.includes('/')) {
    for (const purpose of USER_MEDIA_PREFIXES) {
      try {
        await deleteR2Prefix(env, `${purpose}/${userId}/`);
      } catch (err) {
        console.error('[purge] media', purpose, err);
      }
    }
  }
  for (const sql of NO_CASCADE_CLEANUP) {
    try {
      await env.DB.prepare(sql).bind(userId).run();
    } catch (err) {
      console.error('[purge] cleanup', sql.slice(0, 40), err);
    }
  }
  try {
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
    return 'deleted';
  } catch (err) {
    console.error('[purge] hard delete refused, anonymising', err);
    await env.DB.prepare(
      `UPDATE users SET email = ?, password_hash = '', metadata = '{"deleted":true}', invite_code = NULL,
         email_verification_token_hash = NULL, password_reset_token_hash = NULL, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(`deleted+${userId}@growl.invalid`, userId)
      .run();
    await env.DB.prepare(
      `UPDATE user_account_states SET status = 'deleted', updated_at = datetime('now') WHERE user_id = ?`
    )
      .bind(userId)
      .run();
    return 'anonymised';
  }
}
