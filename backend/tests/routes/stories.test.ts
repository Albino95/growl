/**
 * Stories routes tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import * as storiesRoutes from '../../src/routes/stories';
import * as feedRoutes from '../../src/routes/feed';
import * as commentRoutes from '../../src/routes/comments';
import type { Env } from '../../src/types';

describe('Stories Routes', () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    env = createMockEnv();
    mockDb = {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    };
    env.DB = mockDb as any;
  });

  describe('getStories', () => {
    it('should return active stories', async () => {
      const mockStories = [
        {
          id: 'story-1',
          user_id: 'user-1',
          image_url: 'https://example.com/story1.jpg',
          caption: 'Test story',
          views: 10,
          created_at: new Date().toISOString(),
          user_metadata: JSON.stringify({ username: 'testuser' }),
          view_count: 10,
          has_viewed: 0,
        },
      ];

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT')) {
          return {
            bind: () => ({
              all: async () => ({ results: mockStories }),
            }),
          };
        }
        return {
          bind: () => ({
            all: async () => ({ results: [] }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/stories', {
        method: 'GET',
      });

      const response = await storiesRoutes.getStories(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.stories)).toBe(true);
    });
  });

  describe('createStory', () => {
    it('should create a new story', async () => {
      let storyCreated = false;

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'user-1',
              }),
            }),
          };
        }
        if (query.includes('INSERT INTO stories')) {
          storyCreated = true;
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/stories', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
        body: {
          image_url: 'https://example.com/story.jpg',
          caption: 'My story',
        },
      });

      const response = await storiesRoutes.createStory(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBeDefined();
      expect(storyCreated).toBe(true);
    });

    it('should require authentication', async () => {
      mockDb.prepare = (query: string) => {
        return {
          bind: () => ({
            first: async () => null, // No user found
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/stories', {
        method: 'POST',
        body: {
          image_url: 'https://example.com/story.jpg',
        },
      });

      const response = await storiesRoutes.createStory(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('viewStory', () => {
    it('should record story view', async () => {
      let viewRecorded = false;

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT id, user_id FROM stories')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'story-1',
                user_id: 'user-2', // Different user
              }),
            }),
          };
        }
        if (query.includes('SELECT id FROM story_views')) {
          return {
            bind: () => ({
              first: async () => null, // Not viewed yet
            }),
          };
        }
        if (query.includes('INSERT INTO story_views')) {
          viewRecorded = true;
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        if (query.includes('UPDATE stories SET views')) {
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'user-1',
              }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/stories/story-1/view', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      const response = await storiesRoutes.viewStory(request, env, 'story-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(viewRecorded).toBe(true);
    });
  });

  describe('feed and comment core routes', () => {
    it('getFeed filters to friend posts in feed mode', async () => {
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'test-user', metadata: '{}' }),
            }),
          };
        }
        if (query.includes('SELECT metadata FROM users WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({
                metadata: JSON.stringify({ categories: ['fitness:cardio'] }),
              }),
            }),
          };
        }
        if (query.includes('FROM user_relationships') && query.includes("type IN ('block', 'mute')")) {
          return {
            bind: () => ({
              all: async () => ({ results: [] }),
            }),
          };
        }
        if (query.includes('FROM posts p') && query.includes('friend_likes_count')) {
          return {
            bind: () => ({
              all: async () => ({
                results: [
                  {
                    id: 'friend-post',
                    user_id: 'friend-1',
                    image_url: 'https://example.com/friend.jpg',
                    caption: 'Friend update',
                    category: 'fitness',
                    subcategory: 'cardio',
                    engagement_score: 10,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    user_metadata: JSON.stringify({ username: 'Friend User', avatar: '' }),
                    is_instructor: 0,
                    likes_count: 1,
                    comments_count: 0,
                    viewer_has_liked: 0,
                    friend_likes_count: 0,
                    friend_likers_csv: null,
                  },
                  {
                    id: 'stranger-post',
                    user_id: 'stranger-1',
                    image_url: 'https://example.com/stranger.jpg',
                    caption: 'Stranger update',
                    category: 'fitness',
                    subcategory: 'cardio',
                    engagement_score: 20,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    user_metadata: JSON.stringify({ username: 'Stranger User', avatar: '' }),
                    is_instructor: 0,
                    likes_count: 3,
                    comments_count: 1,
                    viewer_has_liked: 0,
                    friend_likes_count: 0,
                    friend_likers_csv: null,
                  },
                ],
              }),
            }),
          };
        }
        if (query.includes('SELECT target_user_id AS fid FROM user_relationships')) {
          return {
            bind: () => ({
              all: async () => ({ results: [{ fid: 'friend-1' }] }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/feed/feed', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-token' },
      });
      const response = await feedRoutes.getFeed(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe('friend-post');
    });

    it('createComment creates a comment and returns user payload', async () => {
      let insertCalled = false;

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'test-user', metadata: JSON.stringify({ username: 'Test User' }) }),
            }),
          };
        }
        if (query.includes('SELECT id FROM posts WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'post-1' }),
            }),
          };
        }
        if (query.includes("INSERT INTO post_engagement") && query.includes("'comment'")) {
          return {
            bind: () => ({
              run: async () => {
                insertCalled = true;
                return { success: true };
              },
            }),
          };
        }
        if (query.includes('COUNT(CASE WHEN type = \'like\'')) {
          return {
            bind: () => ({
              first: async () => ({ likes: 2, comments: 1 }),
            }),
          };
        }
        if (query.includes('UPDATE posts SET engagement_score = ? WHERE id = ?')) {
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT metadata, is_instructor FROM users WHERE id = ?')) {
          return {
            bind: () => ({
              first: async () => ({
                metadata: JSON.stringify({ username: 'Test User', avatar: '' }),
                is_instructor: 0,
              }),
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/feed/posts/post-1/comments', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: { content: 'Great post!' },
      });

      const response = await commentRoutes.createComment(request, env, 'post-1');
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(insertCalled).toBe(true);
      expect(data.post_id).toBe('post-1');
      expect(data.content).toBe('Great post!');
      expect(data.user.username).toBe('Test User');
    });
  });
});
