/**
 * Who may start or send a DM to a user (users.dm_policy, migration 0036):
 * 'everyone' (default) | 'friends' (requires a friend edge) | 'nobody'.
 */
import type { Env } from '../types';

export const DM_POLICIES = ['everyone', 'friends', 'nobody'] as const;
export type DmPolicy = (typeof DM_POLICIES)[number];
export const DM_POLICY_REJECTED_MESSAGE = "This person isn't taking messages right now.";

export function parseDmPolicy(raw: unknown): DmPolicy {
  return (DM_POLICIES as readonly string[]).includes(String(raw)) ? (raw as DmPolicy) : 'everyone';
}

export async function getDmPolicy(env: Env, userId: string): Promise<DmPolicy> {
  try {
    const row = await env.DB.prepare('SELECT dm_policy FROM users WHERE id = ?')
      .bind(userId)
      .first<{ dm_policy: string | null }>();
    return parseDmPolicy(row?.dm_policy);
  } catch {
    // Column missing (migration 0036 not applied yet): behave as before.
    return 'everyone';
  }
}

/**
 * Does the recipient's policy allow `senderId` to message them?
 * `areFriends` is injected so callers reuse the friend check they already have.
 */
export async function dmPolicyAllows(
  env: Env,
  recipientId: string,
  isFriend: () => Promise<boolean>
): Promise<boolean> {
  const policy = await getDmPolicy(env, recipientId);
  if (policy === 'everyone') return true;
  if (policy === 'nobody') return false;
  return isFriend();
}
