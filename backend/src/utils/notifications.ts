import type { Env } from '../types';
import { generateId } from './id';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'endorsement_received'
  | 'endorsement_request'
  | 'endorsement_accepted'
  | 'post_like'
  | 'post_comment'
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
    /**
     * Skip if this actor already sent this type of notification about the same
     * item (e.g. unlike + like again must not notify the author twice).
     */
    oncePerActorAndRef?: boolean;
    /**
     * Skip if this actor already sent this type about the same item within the
     * last N minutes (e.g. a burst of comments notifies once, later ones again).
     */
    coalesceWithinMinutes?: number;
  }
): Promise<void> {
  if (!input.userId) return;
  if (input.actorId && input.actorId === input.userId) return;

  try {
    if (input.oncePerActorAndRef && input.actorId && input.refId) {
      const existing = await env.DB.prepare(
        `SELECT 1 FROM user_notifications
         WHERE user_id = ? AND actor_id = ? AND type = ? AND ref_id = ?
         LIMIT 1`
      )
        .bind(input.userId, input.actorId, input.type, input.refId)
        .first();
      if (existing) return;
    }

    const windowMinutes = Math.floor(Number(input.coalesceWithinMinutes) || 0);
    if (windowMinutes > 0 && input.actorId && input.refId) {
      const recent = await env.DB.prepare(
        `SELECT 1 FROM user_notifications
         WHERE user_id = ? AND actor_id = ? AND type = ? AND ref_id = ?
           AND created_at > datetime('now', ?)
         LIMIT 1`
      )
        .bind(input.userId, input.actorId, input.type, input.refId, `-${windowMinutes} minutes`)
        .first();
      if (recent) return;
    }

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
