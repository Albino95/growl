import type { Env } from '../types';
import { generateId } from './id';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'endorsement_received'
  | 'endorsement_request'
  | 'endorsement_accepted'
  | 'post_like'
  | 'instructor_claim'
  | 'group_join'
  | 'group_invite'
  | 'coaching_inquiry'
  | 'coaching_proposal'
  | 'coaching_accepted'
  | 'coaching_homework'
  | 'app_review'
  | 'app_review_reply'
  | 'system';

function parseUsername(metadata: string | null | undefined): string {
  try {
    const meta = JSON.parse(metadata || '{}') as { username?: string };
    return typeof meta.username === 'string' && meta.username.trim()
      ? meta.username.trim()
      : 'Someone';
  } catch {
    return 'Someone';
  }
}

export async function resolveUsername(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
    .bind(userId)
    .first<{ metadata: string }>();
  return parseUsername(row?.metadata);
}

/**
 * Insert an in-app notification. Never throws — social actions should not fail
 * because the activity feed write failed.
 */
export async function createUserNotification(
  env: Env,
  input: {
    userId: string;
    actorId?: string | null;
    type: NotificationType;
    title: string;
    body?: string | null;
    refType?: string | null;
    refId?: string | null;
  }
): Promise<void> {
  if (!input.userId) return;
  if (input.actorId && input.actorId === input.userId) return;

  try {
    await env.DB.prepare(
      `INSERT INTO user_notifications
        (id, user_id, actor_id, type, title, body, ref_type, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        generateId('unotif'),
        input.userId,
        input.actorId || null,
        input.type,
        input.title,
        input.body || null,
        input.refType || null,
        input.refId || null
      )
      .run();
  } catch (err) {
    console.error('[createUserNotification]', err);
  }
}
