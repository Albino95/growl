import { describe, it, expect } from 'vitest';
import {
  expandUserCategoryKeys,
  categoryScore,
  recencyScore,
  jitter,
  rankExploreRows,
  type ExploreAlgorithmPost,
  type ExploreAlgorithmProduct,
} from './exploreAlgorithm';

describe('exploreAlgorithm', () => {
  it('expandUserCategoryKeys adds parent segment', () => {
    expect(Array.from(expandUserCategoryKeys(['art:piano']))).toEqual(
      expect.arrayContaining(['art:piano', 'art'])
    );
  });

  it('categoryScore prefers exact subcategory path', () => {
    const keys = expandUserCategoryKeys(['art:piano']);
    expect(categoryScore(keys, 'art', 'piano')).toBeGreaterThan(categoryScore(keys, 'mindset', null));
  });

  it('recencyScore decreases with age', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const fresh = recencyScore('2026-06-01T06:00:00Z', now);
    const old = recencyScore('2026-05-20T06:00:00Z', now);
    expect(fresh).toBeGreaterThan(old);
  });

  it('jitter is deterministic', () => {
    expect(jitter('abc')).toBe(jitter('abc'));
    expect(jitter('abc')).not.toBe(jitter('abd'));
  });

  it('rankExploreRows orders by blended score', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const posts: ExploreAlgorithmPost[] = [
      {
        id: 'p-old',
        category: 'mindset',
        created_at: '2026-05-01T12:00:00Z',
        metadata: { likes: 0, comments: 0 },
      },
      {
        id: 'p-hot',
        category: 'fitness',
        subcategory: 'cardio',
        created_at: '2026-06-01T11:00:00Z',
        metadata: { likes: 50, comments: 10 },
      },
    ];
    const products: ExploreAlgorithmProduct[] = [
      {
        id: 'pr1',
        category: 'fitness',
        subcategory: 'cardio',
        created_at: '2026-06-01T10:00:00Z',
        stock: 5,
      },
    ];
    const ranked = rankExploreRows(posts, products, ['fitness:cardio'], { nowMs: now });
    expect(ranked[0].kind).toBe('post');
    if (ranked[0].kind === 'post') expect(ranked[0].post.id).toBe('p-hot');
  });

  it('cold start still returns sorted rows', () => {
    const posts: ExploreAlgorithmPost[] = [
      { id: 'a', category: 'art', created_at: new Date().toISOString(), metadata: {} },
    ];
    const ranked = rankExploreRows(posts, [], []);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].score).toBeGreaterThanOrEqual(0);
  });

  it('friend author and friend-like signals boost Explore ranking', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const posts: ExploreAlgorithmPost[] = [
      {
        id: 'stranger',
        user_id: 'u-stranger',
        category: 'fitness',
        created_at: '2026-06-01T11:00:00Z',
        metadata: { likes: 5, comments: 0, friend_likes_count: 0 },
      },
      {
        id: 'friend-post',
        user_id: 'u-friend',
        category: 'fitness',
        created_at: '2026-06-01T11:00:00Z',
        metadata: { likes: 5, comments: 0, friend_likes_count: 2 },
      },
    ];
    const ranked = rankExploreRows(posts, [], ['fitness'], {
      nowMs: now,
      friendIds: new Set(['u-friend']),
    });
    expect(ranked[0].kind).toBe('post');
    if (ranked[0].kind === 'post') expect(ranked[0].post.id).toBe('friend-post');
  });
});
