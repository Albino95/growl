import type { ShareCardPayload } from '../share/ShareCardSheet';
import type { ChallengeDetail } from '../../services/api/growth';

/** ChallengeDetail → ShareCardSheet `challenge` card. */
export function challengeSharePayload(
  c: ChallengeDetail,
  me: { id?: string; username?: string; avatar?: string | null } | null | undefined
): ShareCardPayload {
  return {
    kind: 'challenge',
    userId: me?.id,
    username: me?.username,
    avatar: me?.avatar ?? null,
    title: c.title,
    emoji: c.emoji || '🌱',
    progress: Math.min(c.progress, c.target_days),
    target: c.target_days,
    completed: c.completed,
  };
}
