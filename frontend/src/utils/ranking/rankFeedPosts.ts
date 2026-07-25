import type { FeedPost } from '../../services/api/feed';
import {
  categoryScore,
  engagementScore,
  expandUserCategoryKeys,
  jitter,
  recencyScore,
} from './scores';
import { applyPerAuthorCap } from './diversity';

export type RankedFeedPost = FeedPost & {
  relevance_score: number;
  feed_section: 'following' | 'suggested';
};

export type FeedSections = {
  following: RankedFeedPost[];
  suggested: RankedFeedPost[];
};

export function scoreFeedPost(
  post: FeedPost,
  userPaths: string[],
  options: {
    nowMs?: number;
    friendIds?: Set<string>;
    selfId?: string;
    isFriend?: boolean;
    isOwn?: boolean;
  } = {}
): number {
  const nowMs = options.nowMs ?? Date.now();
  const keys = expandUserCategoryKeys(userPaths);
  const likes = post.metadata?.likes ?? 0;
  const comments = post.metadata?.comments ?? 0;
  const friendLikes = post.metadata?.friend_likes_count ?? 0;
  const isOwn = options.isOwn ?? post.user_id === options.selfId;
  const isFriend = options.isFriend ?? !!post.metadata?.is_friend;

  let score =
    categoryScore(keys, post.category, post.subcategory) +
    recencyScore(post.created_at, nowMs) * 0.65 +
    engagementScore(likes, comments);

  if (isFriend) score += 25;
  if (isOwn) score += 100;
  if (post.metadata?.isInstructor) score += 8;
  score += Math.min(26, friendLikes * 8);
  score += jitter(post.id) * 8;

  return score;
}

export function rankFeedPosts(
  posts: FeedPost[],
  userPaths: string[],
  options: {
    nowMs?: number;
    friendIds?: Set<string>;
    selfId?: string;
    minSuggested?: number;
  } = {}
): FeedSections {
  const friendIds = options.friendIds ?? new Set<string>();
  const selfId = options.selfId;
  const minSuggested = options.minSuggested ?? 5;

  const scored = posts.map((post) => {
    const isOwn = !!selfId && post.user_id === selfId;
    const isFriend = friendIds.has(post.user_id) || !!post.metadata?.is_friend;
    const relevance_score = scoreFeedPost(post, userPaths, {
      ...options,
      isOwn,
      isFriend,
    });
    const feed_section: 'following' | 'suggested' = isOwn || isFriend ? 'following' : 'suggested';
    return { ...post, relevance_score, feed_section };
  });

  let following = scored
    .filter((p) => p.feed_section === 'following')
    .sort((a, b) => b.relevance_score - a.relevance_score);

  let suggested = scored
    .filter((p) => p.feed_section === 'suggested')
    .sort((a, b) => b.relevance_score - a.relevance_score);

  suggested = applyPerAuthorCap(suggested, (p) => p.user_id, 2, 50);

  if (suggested.length < minSuggested && userPaths.length > 0) {
    const pool = scored
      .filter((p) => p.feed_section === 'suggested' || (!friendIds.has(p.user_id) && p.user_id !== selfId))
      .sort((a, b) => b.relevance_score - a.relevance_score);
    const extra = applyPerAuthorCap(pool, (p) => p.user_id, 2, minSuggested);
    const seen = new Set(suggested.map((p) => p.id));
    for (const p of extra) {
      if (!seen.has(p.id)) {
        suggested.push({ ...p, feed_section: 'suggested' });
        seen.add(p.id);
      }
      if (suggested.length >= minSuggested) break;
    }
  }

  if (following.length === 0 && suggested.length > 0) {
    following = [];
  }

  return { following, suggested };
}
