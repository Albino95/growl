/**
 * Path Buddies API (backend/src/routes/wave3/buddies.ts): a shared streak with a
 * friend. A day counts when both of you showed up (activity, rest day or life mode).
 */
import { request, newIdempotencyKey } from './http';

type Envelope<T> = { success: boolean; data: T };

export type BuddyUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type BuddyMilestone = { days: number; name: string };

export type Buddy = {
  id: string;
  user: BuddyUser;
  streak: number;
  best: number;
  today: { me: boolean; them: boolean };
  /** Local day the pair started (YYYY-MM-DD). */
  since: string | null;
  milestone: BuddyMilestone | null;
  next_milestone: BuddyMilestone | null;
};

export type BuddyInvite = { id: string; user: BuddyUser; created_at: string };

export type BuddiesPayload = {
  buddies: Buddy[];
  invites_in: BuddyInvite[];
  invites_out: BuddyInvite[];
  max: number;
};

export const MAX_BUDDIES = 5;

export async function getBuddies(): Promise<BuddiesPayload> {
  const res = await request<Envelope<Partial<BuddiesPayload>>>('/buddies');
  const d = res.data || {};
  return {
    buddies: d.buddies ?? [],
    invites_in: d.invites_in ?? [],
    invites_out: d.invites_out ?? [],
    max: d.max ?? MAX_BUDDIES,
  };
}

export async function inviteBuddy(userId: string): Promise<{ id: string }> {
  const res = await request<Envelope<{ buddy: { id: string } }>>('/buddies/invite', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
    idempotencyKey: newIdempotencyKey(),
  });
  return { id: res.data.buddy.id };
}

export async function acceptBuddy(id: string): Promise<Buddy | null> {
  const res = await request<Envelope<{ buddy: Buddy | null }>>(
    `/buddies/${encodeURIComponent(id)}/accept`,
    { method: 'POST' }
  );
  return res.data?.buddy ?? null;
}

export async function declineBuddy(id: string): Promise<void> {
  await request(`/buddies/${encodeURIComponent(id)}/decline`, { method: 'POST' });
}

export async function endBuddy(id: string): Promise<void> {
  await request(`/buddies/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

