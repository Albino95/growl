import type { Env } from '../types';

const DEFAULT_REPLY_EMAILS = ['albino.ndreu@gmail.com', 'albino.ndreu@icloud.com'];

export function reviewReplyEmails(env: Env): string[] {
  const extra = String(env.APP_REVIEW_REPLY_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REPLY_EMAILS, ...extra])];
}

export function canReplyAppReviews(email: string | null | undefined, env: Env): boolean {
  if (!email) return false;
  return reviewReplyEmails(env).includes(email.trim().toLowerCase());
}

export async function listReviewInboxUserIds(env: Env): Promise<string[]> {
  const emails = reviewReplyEmails(env);
  if (emails.length === 0) return [];
  const placeholders = emails.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT id FROM users WHERE lower(email) IN (${placeholders})`)
    .bind(...emails)
    .all<{ id: string }>();
  return (rows.results || []).map((r) => r.id);
}
