import type { Env } from '../types';

const DEFAULT_REPLY_EMAILS = ['albino.ndreu@gmail.com', 'albino.ndreu@icloud.com'];

export function reviewReplyEmails(env: Env): string[] {
  const extra = String(env.APP_REVIEW_REPLY_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REPLY_EMAILS, ...extra])];
}

type ReviewReplier = { email?: string | null; email_verified?: number | boolean | null };

/**
 * Whether this account may reply to app reviews: its email is on the allow-list
 * AND verified (so nobody can claim an allow-listed address by signing up with it).
 * Pass the user row. A bare email string is still accepted for older callers but
 * cannot prove verification, so it is rejected.
 */
export function canReplyAppReviews(
  user: ReviewReplier | string | null | undefined,
  env: Env
): boolean {
  if (!user || typeof user === 'string') return false;
  if (!user.email || !Number(user.email_verified)) return false;
  return reviewReplyEmails(env).includes(user.email.trim().toLowerCase());
}

export async function listReviewInboxUserIds(env: Env): Promise<string[]> {
  const emails = reviewReplyEmails(env);
  if (emails.length === 0) return [];
  const placeholders = emails.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT id FROM users WHERE lower(email) IN (${placeholders}) AND email_verified = 1`)
    .bind(...emails)
    .all<{ id: string }>();
  return (rows.results || []).map((r) => r.id);
}
