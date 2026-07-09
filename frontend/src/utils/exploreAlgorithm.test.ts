import { describe, it, expect } from 'vitest';
import {
  expandUserCategoryKeys,
  categoryScore,
  recencyScore,
  jitter,
  rankExploreRows,
  type ExploreAlgorithmPost,
  type ExploreAlgorithmProduct,
} from './ranking';
import { rankDiscoverPeople, type StoryGroup } from './ranking';

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

  it('rankDiscoverPeople prioritizes relevant non-friends and excludes self/friends', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');
    const storyGroups: StoryGroup[] = [
      {
        userId: 'u-self',
        username: 'Self',
        avatar: null,
        stories: [
          {
            id: 's-self',
            userId: 'u-self',
            username: 'Self',
            avatar: null,
            image: 'self.jpg',
            hasViewed: false,
            createdAt: '2026-06-01T11:45:00Z',
          },
        ],
      },
      {
        userId: 'u-friend',
        username: 'Friend',
        avatar: null,
        stories: [
          {
            id: 's-friend',
            userId: 'u-friend',
            username: 'Friend',
            avatar: null,
            image: 'friend.jpg',
            hasViewed: false,
            createdAt: '2026-06-01T11:45:00Z',
          },
        ],
      },
      {
        userId: 'u-candidate',
        username: 'Candidate',
        avatar: null,
        stories: [
          {
            id: 's-candidate',
            userId: 'u-candidate',
            username: 'Candidate',
            avatar: null,
            image: 'candidate.jpg',
            hasViewed: false,
            createdAt: '2026-06-01T11:40:00Z',
          },
        ],
      },
    ];

    const feedPosts = [
      {
        id: 'p-candidate',
        user_id: 'u-candidate',
        category: 'fitness',
        subcategory: 'cardio',
        created_at: '2026-06-01T11:50:00Z',
        metadata: { likes: 9, comments: 4, username: 'Candidate', avatar: '' },
      },
      {
        id: 'p-other',
        user_id: 'u-other',
        category: 'mindset',
        created_at: '2026-06-01T11:50:00Z',
        metadata: { likes: 0, comments: 0, username: 'Other', avatar: '' },
      },
    ];

    const ranked = rankDiscoverPeople(storyGroups, feedPosts, ['fitness:cardio'], {
      nowMs: now,
      selfId: 'u-self',
      friendIds: new Set(['u-friend']),
    });

    expect(ranked.some((p) => p.userId === 'u-self')).toBe(false);
    expect(ranked.some((p) => p.userId === 'u-friend')).toBe(false);
    expect(ranked[0].userId).toBe('u-candidate');
  });
});
