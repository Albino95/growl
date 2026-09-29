import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin, writeAdminAudit, requestIp } from '../../utils/adminAuth';
import { validateRequest, reportDecisionSchema, appealDecisionSchema, assignReportSchema } from '../../utils/validation';
import { generateId } from '../../utils/id';
import {
  softHideContent,
  softUnhideContent,
  resolveTargetOwnerEmail,
  assertNotProtectedUser,
  isContentRemoveAction,
} from '../../utils/contentModeration';
import { isProtectedReviewEmail } from '../../utils/reviewGuardrails';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function listReports(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'moderation.read');
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const priority = url.searchParams.get('priority') || '';
  const slaBreached = url.searchParams.get('sla_breached') === 'true';

  let query = `SELECT * FROM reports WHERE 1=1`;
  const bindings: unknown[] = [];
  if (status) {
    query += ` AND workflow_status = ?`;
    bindings.push(status);
  }
  if (priority) {
    query += ` AND priority = ?`;
    bindings.push(priority);
  }
  if (slaBreached) {
    query += ` AND sla_due_at IS NOT NULL AND sla_due_at < datetime('now') AND workflow_status IN ('pending', 'investigating')`;
  }
  query += ` ORDER BY created_at DESC LIMIT 200`;
  const rows = await env.DB.prepare(query).bind(...bindings).all();
  return json({
    reports: (rows.results || []).map((r: any) => ({
      ...r,
      details: parseJson(r.details, {}),
    })),
  });
}

export async function getReport(request: Request, env: Env, reportId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'moderation.read');
  if (ctx instanceof Response) return ctx;
  const report = await env.DB.prepare(`SELECT * FROM reports WHERE id = ?`).bind(reportId).first<any>();
  if (!report) return error('NOT_FOUND', 'Report not found', 404);

  const actions = await env.DB.prepare(
    `SELECT * FROM moderation_actions WHERE report_id = ? ORDER BY created_at DESC`
  )
    .bind(reportId)
    .all();

  const subjectId = report.target_type === 'user' ? report.target_id : null;
  let subjectHistory: unknown[] = [];
  if (subjectId) {
    const hist = await env.DB.prepare(
      `SELECT * FROM reports WHERE target_id = ? ORDER BY created_at DESC LIMIT 20`
    )
      .bind(subjectId)
      .all();
    subjectHistory = hist.results || [];
  }

  return json({
    report: { ...report, details: parseJson(report.details, {}) },
    actions: actions.results || [],
    subject_history: subjectHistory,
  });
}

export async function assignReport(request: Request, env: Env, reportId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'moderation.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, assignReportSchema);
  if (!validation.success) return validation.response;
  const { workflow_status, priority, assigned_admin_id } = validation.data;

  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];
  if (workflow_status) {
    fields.push('workflow_status = ?');
    values.push(workflow_status);
  }
  if (priority) {
    fields.push('priority = ?');
    values.push(priority);
  }
  if (assigned_admin_id !== undefined) {
    fields.push('assigned_admin_id = ?');
    values.push(assigned_admin_id);
  }
  values.push(reportId);
  await env.DB.prepare(`UPDATE reports SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'moderation.assign',
    targetType: 'report',
    targetId: reportId,
    reasonText: [
      workflow_status ? `status=${workflow_status}` : null,
      priority ? `priority=${priority}` : null,
      assigned_admin_id !== undefined ? `assignee=${assigned_admin_id ?? 'none'}` : null,
    ]
      .filter(Boolean)
      .join(', '),
    ipAddress: requestIp(request),
  });

  return json({ ok: true });
}

export async function decideReport(request: Request, env: Env, reportId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'moderation.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, reportDecisionSchema);
  if (!validation.success) return validation.response;
  const { decision } = validation.data;
  const report = await env.DB.prepare(`SELECT * FROM reports WHERE id = ?`).bind(reportId).first<any>();
  if (!report) return error('NOT_FOUND', 'Report not found', 404);

  const details = parseJson<{ userId?: string }>(report.details, {});
  const owner = await resolveTargetOwnerEmail(env, report.target_type, report.target_id, details.userId);
  const targetUserId =
    report.target_type === 'user' ? report.target_id : owner.userId || details.userId || null;

  if (owner.email && isProtectedReviewEmail(owner.email)) {
    return error(
      'PROTECTED_ACCOUNT',
      `Cannot enforce against protected review/demo account (${owner.email})`,
      403
    );
  }
  if (targetUserId) {
    const guard = await assertNotProtectedUser(env, targetUserId);
    if (guard.blocked) {
      return error(
        'PROTECTED_ACCOUNT',
        `Cannot enforce against protected review/demo account (${guard.email})`,
        403
      );
    }
  }

  let contentResult: { ok: boolean; skipped?: string } | null = null;
  if (isContentRemoveAction(decision.enforcement?.contentAction)) {
    if (report.target_type === 'post' || report.target_type === 'product') {
      contentResult = await softHideContent(
        env,
        report.target_type,
        report.target_id,
        decision.reasonText,
        ctx.adminId
      );
    } else if (report.target_type === 'user' && targetUserId) {
      // Hide all visible posts by this user (soft) — limited batch for safety
      const posts = await env.DB.prepare(
        `SELECT id FROM posts WHERE user_id = ? AND COALESCE(is_hidden, 0) = 0 LIMIT 200`
      )
        .bind(targetUserId)
        .all<{ id: string }>();
      for (const p of posts.results || []) {
        await softHideContent(env, 'post', p.id, decision.reasonText, ctx.adminId);
      }
      contentResult = { ok: true };
    }
  }

  if (decision.enforcement?.userAction && decision.enforcement.userAction !== 'none' && targetUserId) {
    const action = decision.enforcement.userAction;
    let status = 'active';
    let suspendedUntil: string | null = null;
    if (action === 'warn') status = 'warned';
    if (action === 'suspend') {
      status = 'suspended';
      suspendedUntil = new Date(
        Date.now() + (decision.enforcement.suspendDays || 7) * 86400000
      ).toISOString();
    }
    if (action === 'ban') status = 'banned';
    const strikeDelta =
      decision.enforcement.strikeDelta ??
      (action === 'warn' || action === 'suspend' || action === 'ban' ? 1 : 0);
    await env.DB.prepare(
      `INSERT INTO user_account_states (user_id, status, strike_count, suspended_until, ban_reason, updated_by_admin_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         status = excluded.status,
         strike_count = COALESCE(user_account_states.strike_count, 0) + ?,
         suspended_until = excluded.suspended_until,
         ban_reason = excluded.ban_reason,
         updated_by_admin_id = excluded.updated_by_admin_id,
         updated_at = datetime('now')`
    )
      .bind(
        targetUserId,
        status,
        strikeDelta,
        suspendedUntil,
        action === 'ban' ? decision.reasonText : null,
        ctx.adminId,
        strikeDelta
      )
      .run();
  }

  const actionId = generateId('modact');
  const decisionMeta = {
    ...decision,
    content_result: contentResult,
    target_type: report.target_type,
    target_id: report.target_id,
  };
  await env.DB.prepare(
    `INSERT INTO moderation_actions (id, report_id, user_id, admin_id, action, reason_code, reason_text, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      actionId,
      reportId,
      targetUserId || report.reporter_id,
      ctx.adminId,
      decision.action || 'manual_review',
      decision.reasonCode,
      decision.reasonText,
      JSON.stringify(decisionMeta)
    )
    .run();

  if (decision.closeReport !== false) {
    await env.DB.prepare(
      `UPDATE reports SET workflow_status = 'actioned', updated_at = datetime('now') WHERE id = ?`
    )
      .bind(reportId)
      .run();
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: 'moderation.decision',
    targetType: 'report',
    targetId: reportId,
    reasonCode: decision.reasonCode,
    reasonText: decision.reasonText,
    ipAddress: requestIp(request),
  });

  return json({ ok: true, actionId, content_result: contentResult });
}

export async function batchDecideReports(request: Request, env: Env): Promise<Response> {
  return error('NOT_IMPLEMENTED', 'Batch decisions not implemented', 501);
}

export async function listAppeals(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'appeals.read');
  if (ctx instanceof Response) return ctx;
  const rows = await env.DB.prepare(
    `SELECT a.*, m.action, m.reason_code
     FROM moderation_appeals a
     JOIN moderation_actions m ON m.id = a.moderation_action_id
     ORDER BY a.created_at DESC LIMIT 200`
  ).all();
  return json({ appeals: rows.results || [] });
}

export async function decideAppeal(request: Request, env: Env, appealId: string): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'appeals.write');
  if (ctx instanceof Response) return ctx;
  const validation = await validateRequest(request, appealDecisionSchema);
  if (!validation.success) return validation.response;
  const { status, reasonText } = validation.data;

  const appeal = await env.DB.prepare(`SELECT * FROM moderation_appeals WHERE id = ?`)
    .bind(appealId)
    .first<any>();
  if (!appeal) return error('NOT_FOUND', 'Appeal not found', 404);

  await env.DB.prepare(
    `UPDATE moderation_appeals SET status = ?, decided_by_admin_id = ?, decision_reason = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(status, ctx.adminId, reasonText || null, appealId)
    .run();

  if (status === 'overturned') {
    const guard = await assertNotProtectedUser(env, appeal.user_id);
    if (guard.blocked) {
      // Still allow restoring protected users to active; do not hide their content permanently
    }

    await env.DB.prepare(
      `INSERT INTO user_account_states (user_id, status, strike_count, updated_by_admin_id, updated_at)
       VALUES (?, 'active', 0, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET status = 'active', updated_at = datetime('now')`
    )
      .bind(appeal.user_id, ctx.adminId)
      .run();

    const modAction = await env.DB.prepare(`SELECT metadata FROM moderation_actions WHERE id = ?`)
      .bind(appeal.moderation_action_id)
      .first<{ metadata: string }>();
    const meta = parseJson<{
      target_type?: string;
      target_id?: string;
      enforcement?: { contentAction?: string };
    }>(modAction?.metadata, {});

    if (
      isContentRemoveAction(meta.enforcement?.contentAction) &&
      meta.target_type &&
      meta.target_id &&
      (meta.target_type === 'post' || meta.target_type === 'product')
    ) {
      await softUnhideContent(env, meta.target_type, meta.target_id);
    } else if (meta.target_type === 'user' && appeal.user_id) {
      await env.DB.prepare(
        `UPDATE posts SET is_hidden = 0, hidden_at = NULL, hidden_reason = NULL, updated_at = datetime('now')
         WHERE user_id = ? AND COALESCE(is_hidden, 0) = 1 AND hidden_reason IS NOT NULL`
      )
        .bind(appeal.user_id)
        .run();
    }
  }

  await writeAdminAudit(env, {
    adminId: ctx.adminId,
    action: `appeal.${status}`,
    targetType: 'appeal',
    targetId: appealId,
    reasonText,
    ipAddress: requestIp(request),
  });

  return json({ ok: true, status });
}
