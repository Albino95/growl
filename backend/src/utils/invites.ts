import type { Env } from '../types';
import { parseDbTimestamp } from './days';
import { awardPoints, POINTS } from './points';
import { awardBadge } from './badges';
import { createUserNotification, resolveUsername } from './notifications';
import { restrictionFromState } from './auth';
import { ensureBidirectionalFriend, isBlocked } from '../routes/friends';

/** Invite links (docs/GROWTH_SYSTEM.md §4 "Invites"). */

export const INVITE_URL_BASE = 'https://letsgrow.lu/i/';
export const INVITE_MAX_ACCOUNT_AGE_DAYS = 14;
export const INVITE_REWARD_CAP = 20;
export const INVITE_REWARD_WINDOW_DAYS = 30;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export function generateInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CROCKFORD[b & 31]).join('');
}

/** Crockford-normalize user input (case, hyphens, O→0, I/L→1). Null if malformed. */
export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return CODE_RE.test(s) ? s : null;
}

function isUniqueViolation(err: unknown): boolean {
  return /UNIQUE|constraint/i.test(String((err as Error)?.message ?? err));
}

/** Lazily assign a unique code (retry on collision). */
export async function ensureInviteCode(env: Env, userId: string): Promise<string> {
  const existing = await env.DB.prepare('SELECT invite_code FROM users WHERE id = ?')
    .bind(userId)
    .first<{ invite_code: string | null }>();
  if (existing?.invite_code) return existing.invite_code;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateInviteCode();
    try {
      await env.DB.prepare('UPDATE users SET invite_code = ? WHERE id = ? AND invite_code IS NULL')
        .bind(code, userId)
        .run();
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
    const row = await env.DB.prepare('SELECT invite_code FROM users WHERE id = ?')
      .bind(userId)
      .first<{ invite_code: string | null }>();
    if (row?.invite_code) return row.invite_code;
  }
  throw new Error('Could not allocate an invite code');
}

export type Inviter = { id: string; username: string; avatar: string | null };

/** Active (not deleted / banned / suspended) owner of a code, or null. */
export async function findInviterByCode(env: Env, code: string): Promise<Inviter | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.metadata, s.status AS acct_status, s.suspended_until AS acct_suspended_until
     FROM users u LEFT JOIN user_account_states s ON s.user_id = u.id
     WHERE u.invite_code = ?`
  )
    .bind(code)
    .first<{
      id: string;
      email: string;
      metadata: string | null;
      acct_status: string | null;
      acct_suspended_until: string | null;
    }>();
  if (!row) return null;
  if (row.email?.endsWith('@growl.invalid')) return null;
  if (restrictionFromState(row.acct_status, row.acct_suspended_until)) return null;
  let meta: { username?: unknown; avatar?: unknown } = {};
  try {
    meta = JSON.parse(row.metadata || '{}');
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    username: typeof meta.username === 'string' && meta.username.trim() ? meta.username.trim() : 'Someone',
    avatar: typeof meta.avatar === 'string' && meta.avatar.trim() ? meta.avatar.trim() : null,
  };
}

export type RedeemResult =
  | { ok: true; inviter: Inviter }
  | { ok: false; code: string; message: string; status: number };

/**
 * Redeem rules: once per account, not own code, not blocked either way, account
 * younger than 14 days. Creates the friend edge immediately (manual friendship);
 * the inviter is rewarded on the invitee's first recorded activity.
 */
export async function redeemInvite(env: Env, inviteeId: string, rawCode: unknown): Promise<RedeemResult> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false, code: 'INVITE_NOT_FOUND', message: 'That invite link isn’t valid.', status: 404 };

  const [inviter, me, already] = await Promise.all([
    findInviterByCode(env, code),
    env.DB.prepare('SELECT id, created_at FROM users WHERE id = ?')
      .bind(inviteeId)
      .first<{ id: string; created_at: string }>(),
    env.DB.prepare('SELECT inviter_id FROM invite_redemptions WHERE invitee_id = ?')
      .bind(inviteeId)
      .first<{ inviter_id: string }>(),
  ]);
  if (!inviter || !me) {
    return { ok: false, code: 'INVITE_NOT_FOUND', message: 'That invite link isn’t valid.', status: 404 };
  }
  if (inviter.id === inviteeId) {
    return { ok: false, code: 'OWN_INVITE', message: 'That’s your own invite link — share it with a friend.', status: 400 };
  }
  if (already) {
    return { ok: false, code: 'ALREADY_REDEEMED', message: 'You’ve already joined through an invite.', status: 409 };
  }
  const created = parseDbTimestamp(me.created_at);
  if (created && Date.now() - created.getTime() > INVITE_MAX_ACCOUNT_AGE_DAYS * 86_400_000) {
    return {
      ok: false,
      code: 'ACCOUNT_TOO_OLD',
      message: 'Invites are for new accounts. You can still add your friend from their profile.',
      status: 403,
    };
  }
  if (await isBlocked(env, inviteeId, inviter.id)) {
    // Don't reveal the block.
    return { ok: false, code: 'INVITE_NOT_FOUND', message: 'That invite link isn’t valid.', status: 404 };
  }

  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO invite_redemptions (invitee_id, inviter_id, status, created_at)
     VALUES (?, ?, 'pending', datetime('now'))`
  )
    .bind(inviteeId, inviter.id)
    .run();
  if (Number((ins as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0) !== 1) {
    return { ok: false, code: 'ALREADY_REDEEMED', message: 'You’ve already joined through an invite.', status: 409 };
  }

  // Drop any pending friend requests between the two, then connect them.
  await env.DB.prepare(
    `DELETE FROM user_relationships WHERE type = 'friend_request'
     AND ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))`
  )
    .bind(inviteeId, inviter.id, inviter.id, inviteeId)
    .run();
  await ensureBidirectionalFriend(env, inviteeId, inviter.id, 'manual');
  await awardBadge(env, inviteeId, 'first_friend');
  await awardBadge(env, inviter.id, 'first_friend');
  return { ok: true, inviter };
}

/**
 * Called from recordActivity on a new active day: if the user joined through an
 * invite that's still pending, reward the inviter (+50 points, Gardener badge,
 * `invite_joined` notification) — at most 20 rewarded invites per inviter per 30 days.
 * Over the cap the redemption stays pending and is retried on later activity.
 */
export async function rewardPendingInvite(env: Env, inviteeId: string): Promise<void> {
  const pending = await env.DB.prepare(
    `SELECT inviter_id FROM invite_redemptions WHERE invitee_id = ? AND status = 'pending'`
  )
    .bind(inviteeId)
    .first<{ inviter_id: string }>();
  if (!pending) return;
  const inviterId = pending.inviter_id;

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM invite_redemptions
     WHERE inviter_id = ? AND status = 'rewarded' AND rewarded_at > datetime('now', ?)`
  )
    .bind(inviterId, `-${INVITE_REWARD_WINDOW_DAYS} days`)
    .first<{ n: number }>();
  if (Number(recent?.n ?? 0) >= INVITE_REWARD_CAP) return;

  const res = await env.DB.prepare(
    `UPDATE invite_redemptions SET status = 'rewarded', rewarded_at = datetime('now')
     WHERE invitee_id = ? AND status = 'pending'`
  )
    .bind(inviteeId)
    .run();
  if (Number((res as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0) !== 1) return;

  await awardPoints(env, inviterId, POINTS.INVITE_REWARD);
  const name = await resolveUsername(env, inviteeId);
  await createUserNotification(env, {
    userId: inviterId,
    actorId: inviteeId,
    type: 'invite_joined',
    title: `${name} joined Grow! through your invite 🪴`,
    body: `You’re growing together now. +${POINTS.INVITE_REWARD} points.`,
    refType: 'user',
    refId: inviteeId,
  });
  await awardBadge(env, inviterId, 'first_invite');
}

/** Sign-up stores a pending code in metadata; redeem it once the email is verified. */
export async function redeemPendingSignupInvite(env: Env, userId: string): Promise<void> {
  try {
    const row = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(userId)
      .first<{ metadata: string | null }>();
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row?.metadata || '{}');
    } catch {
      return;
    }
    const code = meta.pending_invite_code;
    if (typeof code !== 'string' || !code) return;
    await redeemInvite(env, userId, code);
    delete meta.pending_invite_code;
    await env.DB.prepare(`UPDATE users SET metadata = ? WHERE id = ?`)
      .bind(JSON.stringify(meta), userId)
      .run();
  } catch (err) {
    console.error('[redeemPendingSignupInvite]', err);
  }
}
