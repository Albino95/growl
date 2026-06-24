import { describe, it, expect, beforeEach } from 'vitest';
import { cohortsOverlap, expandCohortKeys, addFriend, listFriends } from '../../src/routes/friends';
import { createMockEnv, createMockRequest, parseJsonResponse } from '../utils/test-helpers';
import type { Env } from '../../src/types';

describe('friends cohort helpers', () => {
  it('expandCohortKeys adds parent segment', () => {
    const k = expandCohortKeys(['art:piano']);
    expect(k.has('art:piano')).toBe(true);
    expect(k.has('art')).toBe(true);
  });

  it('cohortsOverlap on exact path', () => {
    expect(cohortsOverlap(['art:piano'], ['art:piano'])).toBe(true);
  });

  it('cohortsOverlap when sharing parent category', () => {
    expect(cohortsOverlap(['art:piano'], ['art:guitar'])).toBe(true);
  });

  it('no overlap for disjoint categories', () => {
    expect(cohortsOverlap(['fitness:cardio'], ['mindset:meditation'])).toBe(false);
  });

  it('trim and lowercase', () => {
    expect(cohortsOverlap(['  ART:Piano  '], ['art:piano'])).toBe(true);
  });
});

describe('friends routes', () => {
  let env: Env;
  let mockDb: any;

  beforeEach(() => {
    env = createMockEnv();
    mockDb = {
      prepare: (query: string) => ({
        bind: (..._args: any[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    };
    env.DB = mockDb as any;
  });

  it('addFriend creates friend_request edge when not connected', async () => {
    const insertCalls: any[][] = [];

    mockDb.prepare = (query: string) => {
      if (query.includes('SELECT * FROM users WHERE id = ?')) {
        return {
          bind: (userId: string) => ({
            first: async () =>
              userId === 'test-user' ? { id: 'test-user', metadata: '{}' } : null,
          }),
        };
      }
      if (query.includes('SELECT id FROM users WHERE id = ?')) {
        return {
          bind: (targetUserId: string) => ({
            first: async () => (targetUserId === 'user-b' ? { id: 'user-b' } : null),
          }),
        };
      }
      if (query.includes("SELECT 1 AS ok FROM user_relationships WHERE type = 'block'")) {
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      }
      if (
        query.includes("SELECT 1 AS ok FROM user_relationships WHERE type = 'friend'") ||
        query.includes("SELECT 1 FROM user_relationships WHERE user_id = ? AND target_user_id = ? AND type = ?")
      ) {
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      }
      if (query.includes("INSERT INTO user_relationships") && query.includes("'friend_request'")) {
        return {
          bind: (...args: any[]) => ({
            run: async () => {
              insertCalls.push(args);
              return { success: true };
            },
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

    const request = createMockRequest('https://example.com/api/v1/social/friends', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: { targetUserId: 'user-b' },
    });

    const response = await addFriend(request, env);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.connected).toBe(false);
    expect(data.requestSent).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toContain('test-user');
    expect(insertCalls[0]).toContain('user-b');
  });

  it('listFriends returns mapped friend users', async () => {
    mockDb.prepare = (query: string) => {
      if (query.includes('SELECT * FROM users WHERE id = ?')) {
        return {
          bind: () => ({
            first: async () => ({ id: 'test-user', metadata: '{}' }),
          }),
        };
      }
      if (query.includes('SELECT DISTINCT u.id, u.metadata')) {
        return {
          bind: () => ({
            all: async () => ({
              results: [
                {
                  id: 'friend-1',
                  metadata: JSON.stringify({ username: 'Friend One', avatar: 'https://example.com/a.png' }),
                },
              ],
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

    const request = createMockRequest('https://example.com/api/v1/social/friends', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-token' },
    });
    const response = await listFriends(request, env);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.friends).toHaveLength(1);
    expect(data.friends[0]).toMatchObject({ id: 'friend-1', username: 'Friend One' });
  });
});
