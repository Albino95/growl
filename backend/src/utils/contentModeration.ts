import { Env } from '../types';
import { isProtectedReviewEmail } from './reviewGuardrails';

export type ContentTargetType = 'post' | 'product' | 'user';

/** Soft-hide reportable content. Never hard-deletes rows. */
export async function softHideContent(
  env: Env,
  targetType: string,
  targetId: string,
  reason: string,
  _adminId: string
): Promise<{ ok: boolean; skipped?: string }> {
  if (targetType === 'post') {
    await env.DB.prepare(
      `UPDATE posts SET is_hidden = 1, hidden_at = datetime('now'), hidden_reason = ?, updated_at = datetime('now')
       WHERE id = ? AND COALESCE(is_hidden, 0) = 0`
    )
      .bind(reason.slice(0, 500), targetId)
      .run();
    return { ok: true };
  }
  if (targetType === 'product') {
    await env.DB.prepare(
      `UPDATE products SET is_hidden = 1, hidden_at = datetime('now'), hidden_reason = ?, updated_at = datetime('now')
       WHERE id = ? AND COALESCE(is_hidden, 0) = 0`
    )
      .bind(reason.slice(0, 500), targetId)
      .run();
    return { ok: true };
  }
  return { ok: false, skipped: `unsupported_target_type:${targetType}` };
}

export async function softUnhideContent(
  env: Env,
  targetType: string,
  targetId: string
): Promise<{ ok: boolean; skipped?: string }> {
  if (targetType === 'post') {
    await env.DB.prepare(
      `UPDATE posts SET is_hidden = 0, hidden_at = NULL, hidden_reason = NULL, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(targetId)
      .run();
    return { ok: true };
  }
  if (targetType === 'product') {
    await env.DB.prepare(
      `UPDATE products SET is_hidden = 0, hidden_at = NULL, hidden_reason = NULL, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(targetId)
      .run();
    return { ok: true };
  }
  return { ok: false, skipped: `unsupported_target_type:${targetType}` };
}

/** Resolve owner email for a report target (user / post / product). */
export async function resolveTargetOwnerEmail(
  env: Env,
  targetType: string,
  targetId: string,
  detailsUserId?: string | null
): Promise<{ userId: string | null; email: string | null }> {
  if (targetType === 'user') {
    const row = await env.DB.prepare(`SELECT id, email FROM users WHERE id = ?`)
      .bind(targetId)
      .first<{ id: string; email: string }>();
    return { userId: row?.id ?? null, email: row?.email ?? null };
  }
  if (targetType === 'post') {
    const row = await env.DB.prepare(
      `SELECT u.id, u.email FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
      .bind(targetId)
      .first<{ id: string; email: string }>();
    return { userId: row?.id ?? null, email: row?.email ?? null };
  }
  if (targetType === 'product') {
    const row = await env.DB.prepare(
      `SELECT u.id, u.email FROM products p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
      .bind(targetId)
      .first<{ id: string; email: string }>();
    return { userId: row?.id ?? null, email: row?.email ?? null };
  }
  if (detailsUserId) {
    const row = await env.DB.prepare(`SELECT id, email FROM users WHERE id = ?`)
      .bind(detailsUserId)
      .first<{ id: string; email: string }>();
    return { userId: row?.id ?? null, email: row?.email ?? null };
  }
  return { userId: null, email: null };
}

export async function assertNotProtectedUser(
  env: Env,
  userId: string | null | undefined
): Promise<{ blocked: true; email: string } | { blocked: false }> {
  if (!userId) return { blocked: false };
  const row = await env.DB.prepare(`SELECT email FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ email: string }>();
  if (row && isProtectedReviewEmail(row.email)) {
    return { blocked: true, email: row.email };
  }
  return { blocked: false };
}

export function isContentRemoveAction(action: string | undefined): boolean {
  return action === 'remove' || action === 'hide';
}
