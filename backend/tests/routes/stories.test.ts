/**
 * Stories routes tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import * as storiesRoutes from '../../src/routes/stories';
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
});
