/**
 * Rank people to discover on Explore (stories + feed authors), excluding self and existing friends.
 */

import type { FeedPost } from '../services/api/feed';
import type { StoryItem } from '../services/api/stories';
import { expandUserCategoryKeys, categoryScore, recencyScore, jitter } from './exploreAlgorithm';

export type StoryGroup = {
  userId: string;
  username: string;
  avatar: string | null;
  stories: StoryItem[];
};

export type DiscoverPerson = {
  userId: string;
  username: string;
  avatar: string | null;
  storyCount: number;
  latestStoryImage?: string;
  score: number;
  /** Latest post from this user in feed (for reel preview) */
  latestPost?: FeedPost;
};

export function rankDiscoverPeople(
  storyGroups: StoryGroup[],
  feedPosts: FeedPost[],
  userPaths: string[],
  options: { selfId?: string; friendIds?: Set<string>; nowMs?: number } = {}
): DiscoverPerson[] {
  const selfId = options.selfId;
  const friendIds = options.friendIds ?? new Set<string>();
  const nowMs = options.nowMs ?? Date.now();
  const keys = expandUserCategoryKeys(userPaths);

  const byUser = new Map<string, DiscoverPerson>();

  for (const g of storyGroups) {
    if (!g.userId || g.userId === selfId || friendIds.has(g.userId)) continue;
    const latest = g.stories[0];
    let score = 40 + g.stories.length * 6;
    if (latest?.createdAt) score += recencyScore(latest.createdAt, nowMs) * 0.8;
    score += jitter(g.userId) * 10;
    byUser.set(g.userId, {
      userId: g.userId,
      username: g.username,
      avatar: g.avatar,
      storyCount: g.stories.length,
      latestStoryImage: latest?.image,
      score,
    });
  }

  for (const p of feedPosts) {
    if (!p.user_id || p.user_id === selfId || friendIds.has(p.user_id)) continue;
    const catBoost = categoryScore(keys, p.category, p.subcategory);
    const eng = (p.metadata?.likes ?? 0) + (p.metadata?.comments ?? 0);
    const postBoost = recencyScore(p.created_at, nowMs) * 0.5 + Math.min(20, eng);
    const existing = byUser.get(p.user_id);
    if (existing) {
      existing.score += catBoost + postBoost;
      if (!existing.latestPost || p.created_at > existing.latestPost.created_at) {
        existing.latestPost = p;
      }
    } else {
      byUser.set(p.user_id, {
        userId: p.user_id,
        username: p.metadata?.username || 'Member',
        avatar: p.metadata?.avatar ?? null,
        storyCount: 0,
        score: catBoost + postBoost + jitter(p.user_id) * 8,
        latestPost: p,
      });
    }
  }

  return Array.from(byUser.values()).sort((a, b) => b.score - a.score);
}

/** Feed posts from non-friends, ranked for a “reels” style list on Explore */
export function rankDiscoverReelPosts(
  feedPosts: FeedPost[],
  userPaths: string[],
  options: { selfId?: string; friendIds?: Set<string>; nowMs?: number } = {}
): FeedPost[] {
  const selfId = options.selfId;
  const friendIds = options.friendIds ?? new Set<string>();
  const nowMs = options.nowMs ?? Date.now();
  const keys = expandUserCategoryKeys(userPaths);

  return feedPosts
    .filter((p) => p.user_id && p.user_id !== selfId && !friendIds.has(p.user_id))
    .map((p) => {
      const score =
        categoryScore(keys, p.category, p.subcategory) +
        recencyScore(p.created_at, nowMs) * 0.65 +
        Math.min(30, ((p.metadata?.likes ?? 0) + (p.metadata?.comments ?? 0)) * 1.2) +
        jitter(p.id) * 6;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ p }) => p);
}
