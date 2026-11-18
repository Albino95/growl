import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin, writeAdminAudit, requestIp, SYSTEM_ADMIN_ID } from '../../utils/adminAuth';
import { validateRequest, privacyRequestCreateSchema, privacyRequestUpdateSchema } from '../../utils/validation';
import { generateId } from '../../utils/id';
import { parsePaging, likePattern, searchQuery, paged } from '../../utils/adminLists';
import { revokeAllUserRefreshTokens } from '../../utils/sessions';
import { scrubUserForDeletion, hardDeleteUser } from '../privacy';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Days between "delete my account" and the hard delete. */
export const DELETION_GRACE_DAYS = 7;
/** Accounts purged per cron run (each one is a handful of statements + R2 listing). */
const PURGE_BATCH = 20;

const FINISHED = new Set(['completed', 'rejected']);

export async function listPrivacyRequests(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const type = url.searchParams.get('type') || '';
  const q = searchQuery(url);
  const { limit, offset } = parsePaging(url, 50, 200);
  let where = `WHERE 1=1`;
  const bindings: unknown[] = [];
  if (status) {
    where += ` AND pr.status = ?`;
    bindings.push(status);
  }
  if (type === 'export' || type === 'delete') {
    where += ` AND pr.request_type = ?`;
    bindings.push(type);
  }
  if (q) {
    where += ` AND (pr.id = ? OR pr.user_id = ? OR u.email LIKE ? ESCAPE '\\')`;
    bindings.push(q, q, likePattern(q));
  }
  const from = `FROM privacy_requests pr JOIN users u ON u.id = pr.user_id ${where}`;
  const [countRow, rows] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...bindings).first<{ total: number }>(),
    env.DB.prepare(
      `SELECT pr.id, pr.user_id, pr.request_type, pr.status, pr.assigned_admin_id, pr.details,
              pr.created_at, pr.updated_at, u.email
       ${from}
       ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all(),
  ]);
  const requests = (rows.results || []).map((r: any) => ({
    ...r,
    details: parseJson(r.details, {}),
    finished: FINISHED.has(r.status),
  }));
  return json({ requests, ...paged(requests, countRow?.total ?? 0, limit, offset) });
}

export async function createPrivacyRequest(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, privacyRequestCreateSchema);
  if (!validation.success) return validation.response;
  const { userId, requestType, details } = validation.data;

  const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
  if (!user) return error('NOT_FOUND', 'User not found', 404);

  const id = generateId('privacy');
  await env.DB.prepare(
    `INSERT INTO privacy_requests (id, user_id, request_type, status, details, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
  )
    .bind(id, userId, requestType, JSON.stringify(details || {}))
    .run();

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'privacy.request_create',
    targetType: 'user',
    targetId: userId,
    metadata: { requestType, requestId: id },
    ipAddress: requestIp(request),
  });

  return json({ id }, 201);
}

export async function updatePrivacyRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, privacyRequestUpdateSchema);
  if (!validation.success) return validation.response;
  const { status, assigned_admin_id } = validation.data;

  const req = await env.DB.prepare(`SELECT id, user_id, request_type, status FROM privacy_requests WHERE id = ?`)
    .bind(requestId)
    .first<{ id: string; user_id: string; request_type: string; status: string }>();
  if (!req) return error('NOT_FOUND', 'Privacy request not found', 404);
  if (FINISHED.has(req.status)) {
    return error('REQUEST_FINISHED', `This request is already ${req.status}`, 409);
  }

  await env.DB.prepare(
    `UPDATE privacy_requests SET status = ?, assigned_admin_id = COALESCE(?, assigned_admin_id), updated_at = datetime('now') WHERE id = ?`
  )
    .bind(status, assigned_admin_id || ctx.adminId, requestId)
    .run();

  if (status === 'completed' && req.request_type === 'delete') {
    // Same immediate steps as self-service deletion; the hourly purge hard-deletes later.
    await scrubUserForDeletion(env, req.user_id, ctx.adminId);
    await revokeAllUserRefreshTokens(env, req.user_id);
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: `privacy.request_${status}`,
    targetType: 'privacy_request',
    targetId: requestId,
    metadata: { request_type: req.request_type, user_id: req.user_id },
    ipAddress: requestIp(request),
  });

  return json({ ok: true, status });
}

type Rows = Record<string, unknown>[];

/** One section of the export; a missing table in an older schema yields [] instead of failing. */
async function section(env: Env, sql: string, ...args: unknown[]): Promise<Rows> {
  try {
    const res = await env.DB.prepare(sql).bind(...args).all<Record<string, unknown>>();
    return (res.results || []) as Rows;
  } catch (err) {
    console.error('[privacy.export] section failed', sql.slice(0, 60), err);
    return [];
  }
}

/**
 * Everything we hold about a member, for a GDPR access request. Never includes who
 * reported them (only reports the member filed) or other people's private content.
 */
export async function buildUserExport(env: Env, userId: string) {
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.points, u.is_instructor, u.is_business, u.metadata, u.timezone,
            u.dm_policy, u.life_mode, u.email_verified, u.created_at, u.updated_at,
            s.status AS account_status, s.strike_count, s.suspended_until
     FROM users u LEFT JOIN user_account_states s ON s.user_id = u.id WHERE u.id = ?`
  )
    .bind(userId)
    .first<any>();
  if (!user) return null;

  const [
    posts,
    comments,
    journal,
    checkins,
    weeklyCheckins,
    messages,
    proofs,
    groups,
    cohorts,
    seeds,
    orders,
    orderItems,
    contracts,
    reportsFiled,
    appeals,
    badges,
    stories,
    businessProfile,
  ] = await Promise.all([
    section(
      env,
      `SELECT id, image_url, caption, category, subcategory, metadata, is_hidden, created_at, updated_at
       FROM posts WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT id, post_id, parent_id, content, created_at FROM post_engagement
       WHERE user_id = ? AND type = 'comment' ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT id, title, content, mood, tags, is_public, created_at, updated_at
       FROM journal_entries WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT day, tz, mood, path, intention, rest, followup, created_at, updated_at
       FROM daily_checkins WHERE user_id = ? ORDER BY day`,
      userId
    ),
    section(
      env,
      `SELECT id, week, week_start, questions, answers, shared_with_coach, submitted_at
       FROM weekly_checkins WHERE user_id = ? ORDER BY week_start`,
      userId
    ),
    // Messages this member sent (not what others sent them).
    section(
      env,
      `SELECT id, conversation_id, body, created_at, deleted_at FROM messages
       WHERE sender_id = ? ORDER BY created_at`,
      userId
    ),
    // Proof metadata only; private media keys stay server-side.
    section(
      env,
      `SELECT id, kind, text, number, unit, minutes, duration_s, media_type,
              CASE WHEN media_key IS NOT NULL THEN 1 ELSE 0 END AS has_media,
              media_expired_at, context_type, context_id, path, day,
              shared_with_coach, shared_with_friends, points, created_at
       FROM proofs WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT m.group_id, g.name, g.path_key, m.role, m.joined_at
       FROM growth_group_members m LEFT JOIN growth_groups g ON g.id = m.group_id
       WHERE m.user_id = ?`,
      userId
    ),
    section(
      env,
      `SELECT m.cohort_id, c.title, c.path, m.status, m.joined_at, m.left_at
       FROM cohort_members m LEFT JOIN cohorts c ON c.id = m.cohort_id
       WHERE m.user_id = ?`,
      userId
    ),
    section(
      env,
      `SELECT m.seed_id, s.title, s.category_key, s.stage, m.role, m.status, m.joined_at
       FROM growth_seed_members m LEFT JOIN growth_seeds s ON s.id = m.seed_id
       WHERE m.user_id = ?`,
      userId
    ),
    section(
      env,
      `SELECT id, status, payment_status, total, refund_amount, shipping_address, created_at, updated_at
       FROM orders WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT oi.order_id, oi.product_id, p.name AS product_name, oi.quantity, oi.price
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ?`,
      userId
    ),
    section(
      env,
      `SELECT id, CASE WHEN client_id = ? THEN 'client' ELSE 'coach' END AS role,
              weeks, sessions_per_week, weekly_fee_eur, total_eur, currency, status,
              started_at, ends_at, completed_at, share_checkins, created_at
       FROM coaching_contracts WHERE client_id = ? OR instructor_id = ? ORDER BY created_at`,
      userId,
      userId,
      userId
    ),
    // Only reports this member filed — never who reported them.
    section(
      env,
      `SELECT id, target_type, target_id, reason, status, created_at
       FROM reports WHERE reporter_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT id, appeal_text, status, decision_reason, created_at, updated_at
       FROM moderation_appeals WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(env, `SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at`, userId),
    section(
      env,
      `SELECT id, image_url, caption, created_at, expires_at FROM stories WHERE user_id = ? ORDER BY created_at`,
      userId
    ),
    section(
      env,
      `SELECT display_name, contact_email, contact_phone, field_of_operation, vat_number,
              country_code, address_line, verification_status, created_at
       FROM business_profiles WHERE user_id = ?`,
      userId
    ),
  ]);

  const itemsByOrder = new Map<string, Rows>();
  for (const item of orderItems) {
    const key = String(item.order_id);
    const list = itemsByOrder.get(key) || [];
    const { order_id: _omit, ...rest } = item;
    list.push(rest);
    itemsByOrder.set(key, list);
  }

  return {
    profile: { ...user, metadata: parseJson(user.metadata, {}) },
    posts: posts.map((p) => ({ ...p, metadata: parseJson(p.metadata as string, {}) })),
    comments,
    journal_entries: journal,
    checkins,
    weekly_checkins: weeklyCheckins.map((w) => ({
      ...w,
      questions: parseJson(w.questions as string, w.questions),
      answers: parseJson(w.answers as string, w.answers),
    })),
    messages_sent: messages,
    proofs,
    memberships: { groups, cohorts, seeds },
    orders: orders.map((o) => ({
      ...o,
      shipping_address: parseJson(o.shipping_address as string, {}),
      items: itemsByOrder.get(String(o.id)) || [],
    })),
    coaching_contracts: contracts,
    reports_filed: reportsFiled,
    appeals,
    badges,
    stories,
    business_profile: businessProfile[0] || null,
    exported_at: new Date().toISOString(),
  };
}

export async function exportUserData(request: Request, env: Env, userId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'privacy.read');
  if (ctx instanceof Response) return ctx;

  const payload = await buildUserExport(env, userId);
  if (!payload) return error('NOT_FOUND', 'User not found', 404);

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'privacy.export',
    targetType: 'user',
    targetId: userId,
    metadata: {
      posts: payload.posts.length,
      messages_sent: payload.messages_sent.length,
      orders: payload.orders.length,
    },
    ipAddress: requestIp(request),
  });

  return json(payload);
}

/** 'YYYY-MM-DD HH:MM:SS' (SQLite datetime) for a JS date. */
function sqlDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Hourly (called from scheduled() in src/index.ts): hard-deletes accounts that have been
 * deleted_pending for longer than the grace period, reusing the account-deletion logic
 * (R2 media incl. proof/, rows). Skipped when an admin rejected the deletion request.
 */
export async function runPrivacyPurge(env: Env, now: Date = new Date()): Promise<number> {
  const cutoff = sqlDate(new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000));
  const candidates = await env.DB.prepare(
    `SELECT s.user_id FROM user_account_states s
     WHERE s.status = 'deleted_pending'
       AND datetime(COALESCE(s.deletion_requested_at, s.updated_at)) <= datetime(?)
       AND NOT EXISTS (
         SELECT 1 FROM privacy_requests pr
         WHERE pr.user_id = s.user_id AND pr.request_type = 'delete' AND pr.status = 'rejected'
       )
     ORDER BY COALESCE(s.deletion_requested_at, s.updated_at) ASC
     LIMIT ?`
  )
    .bind(cutoff, PURGE_BATCH)
    .all<{ user_id: string }>();

  let purged = 0;
  for (const row of candidates.results || []) {
    try {
      const outcome = await hardDeleteUser(env, row.user_id);
      purged += 1;
      try {
        await writeAdminAudit(env, {
          adminId: SYSTEM_ADMIN_ID,
          action: outcome === 'deleted' ? 'privacy.purged' : 'privacy.anonymised',
          targetType: 'user',
          targetId: row.user_id,
          metadata: { grace_days: DELETION_GRACE_DAYS },
        });
      } catch (err) {
        console.error('[privacy.purge] audit', err);
      }
    } catch (err) {
      console.error('[privacy.purge] user', row.user_id, err);
    }
  }
  return purged;
}
