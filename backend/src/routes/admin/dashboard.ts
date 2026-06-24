import { Env } from '../../types';
import { json, error } from '../../utils/response';
import { requireAdmin } from '../../utils/adminAuth';

export async function getAdminOverview(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'dashboard.read');
  if (ctx instanceof Response) return ctx;

  try {
    const [pendingReports, openAppeals, privacyPending, totalUsers, orders7d, revenue7d, refunds7d, trends] =
      await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM reports WHERE workflow_status IN ('pending', 'investigating')`
        ).first<{ c: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM moderation_appeals WHERE status = 'pending'`).first<{
          c: number;
        }>(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM privacy_requests WHERE status IN ('pending', 'in_progress')`).first<{
          c: number;
        }>(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM users`).first<{ c: number }>(),
        env.DB.prepare(
          `SELECT COUNT(*) as c FROM orders WHERE created_at >= datetime('now', '-7 days')`
        ).first<{ c: number }>(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(total), 0) as t FROM orders WHERE created_at >= datetime('now', '-7 days')`
        ).first<{ t: number }>(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(refund_amount), 0) as t FROM orders WHERE created_at >= datetime('now', '-7 days')`
        ).first<{ t: number }>(),
        env.DB.prepare(
          `SELECT date(created_at) as day, COUNT(*) as count
           FROM reports WHERE created_at >= datetime('now', '-7 days')
           GROUP BY date(created_at) ORDER BY day ASC`
        ).all(),
      ]);

    return json({
      kpis: {
        pending_reports: pendingReports?.c || 0,
        open_appeals: openAppeals?.c || 0,
        privacy_pending: privacyPending?.c || 0,
        total_users: totalUsers?.c || 0,
        orders_7d: orders7d?.c || 0,
        revenue_7d: revenue7d?.t || 0,
        refunds_7d: refunds7d?.t || 0,
      },
      trends: { reports_7d: trends.results || [] },
    });
  } catch (err) {
    console.error('[getAdminOverview]', err);
    return error('DATABASE_ERROR', 'Failed to load overview', 500);
  }
}

export async function getAdminAnalytics(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAdmin(request, env, 'analytics.read');
  if (ctx instanceof Response) return ctx;

  try {
    const [reportStatusMix, enforcementMix, appealOutcomes] = await Promise.all([
      env.DB.prepare(
        `SELECT workflow_status, COUNT(*) as count FROM reports GROUP BY workflow_status`
      ).all(),
      env.DB.prepare(
        `SELECT action, COUNT(*) as count FROM moderation_actions GROUP BY action ORDER BY count DESC LIMIT 20`
      ).all(),
      env.DB.prepare(
        `SELECT status, COUNT(*) as count FROM moderation_appeals GROUP BY status`
      ).all(),
    ]);

    return json({
      report_status_mix: reportStatusMix.results || [],
      enforcement_mix: enforcementMix.results || [],
      appeal_outcomes: appealOutcomes.results || [],
    });
  } catch (err) {
    console.error('[getAdminAnalytics]', err);
    return error('DATABASE_ERROR', 'Failed to load analytics', 500);
  }
}
