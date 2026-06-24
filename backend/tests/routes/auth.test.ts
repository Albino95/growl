/**
 * Authentication routes tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import * as authRoutes from '../../src/routes/auth';
import type { Env } from '../../src/types';

describe('Auth Routes', () => {
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
        first: async () => null,
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };
    env.DB = mockDb as any;
  });

  describe('signUp', () => {
    it('should create a new user', async () => {
      let insertCalled = false;
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT id FROM users')) {
          return {
            bind: () => ({
              first: async () => null, // User doesn't exist
            }),
          };
        }
        if (query.includes('INSERT INTO users')) {
          insertCalled = true;
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

      const request = createMockRequest('https://example.com/api/v1/auth/sign-up', {
        method: 'POST',
        body: {
          email: 'test@example.com',
          password: 'Password123!',
          username: 'testuser',
        },
      });

      const response = await authRoutes.signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.requiresEmailVerification).toBe(true);
      expect(insertCalled).toBe(true);
    });

    it('should reject duplicate email', async () => {
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT id FROM users')) {
          return {
            bind: () => ({
              first: async () => ({ id: 'existing-user-id' }), // User exists
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

      const request = createMockRequest('https://example.com/api/v1/auth/sign-up', {
        method: 'POST',
        body: {
          email: 'existing@example.com',
          password: 'Password123!',
        },
      });

      const response = await authRoutes.signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('USER_EXISTS');
    });

    it('should validate email format', async () => {
      const request = createMockRequest('https://example.com/api/v1/auth/sign-up', {
        method: 'POST',
        body: {
          email: 'invalid-email',
          password: 'short',
        },
      });

      const response = await authRoutes.signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('signIn', () => {
    it('should authenticate user with correct credentials', async () => {
      // Mock password hash (SHA-256 of 'password123')
      const passwordHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
      
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'user-123',
                email: 'test@example.com',
                password_hash: passwordHash,
                email_verified: 1,
                points: 100,
                is_instructor: false,
                is_business: false,
                metadata: JSON.stringify({
                  username: 'testuser',
                  categories: ['fitness:building-muscle'],
                }),
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

      const request = createMockRequest('https://example.com/api/v1/auth/sign-in', {
        method: 'POST',
        body: {
          email: 'test@example.com',
          password: 'password123',
        },
      });

      const response = await authRoutes.signIn(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.token).toBeDefined();
      expect(data.data.userId).toBe('user-123');
      expect(data.data.isInstructor).toBe(false);
      expect(data.data.isBusiness).toBe(false);
      expect(data.data.hasCompletedOnboarding).toBe(true);
      expect(data.data.categories).toEqual(['fitness:building-muscle']);
    });

    it('should reject invalid credentials', async () => {
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => null, // User not found
            }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      };

      const request = createMockRequest('https://example.com/api/v1/auth/sign-in', {
        method: 'POST',
        body: {
          email: 'wrong@example.com',
          password: 'wrong-password',
        },
      });

      const response = await authRoutes.signIn(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should not auto-promote business privileges on sign-in', async () => {
      const passwordHash = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
      let updateRan = false;

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'biz-user-1',
                email: 'business@growl.app',
                password_hash: passwordHash,
                email_verified: 1,
                points: 100,
                is_instructor: false,
                is_business: false,
                metadata: JSON.stringify({
                  username: 'bizdemo',
                  categories: ['fitness'],
                }),
              }),
            }),
          };
        }
        if (query.includes('UPDATE users SET is_business')) {
          updateRan = true;
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

      const request = createMockRequest('https://example.com/api/v1/auth/sign-in', {
        method: 'POST',
        body: {
          email: 'business@growl.app',
          password: 'password123',
        },
      });

      const response = await authRoutes.signIn(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(updateRan).toBe(false);
      expect(data.data.isBusiness).toBe(false);
      expect(data.data.isInstructor).toBe(false);
    });
  });

  describe('signInWithSSO', () => {
    it('should create user if not exists', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ email: 'google.user@example.com', name: 'Google User' }), {
          status: 200,
        });

      let userCreated = false;
      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users WHERE email')) {
          return {
            bind: () => ({
              first: async () => null,
            }),
          };
        }
        if (query.includes('INSERT INTO users')) {
          userCreated = true;
          return {
            bind: () => ({
              run: async () => ({ success: true }),
            }),
          };
        }
        if (query.includes('SELECT * FROM users WHERE id')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'new-user-123',
                email: 'google.user@example.com',
                password_hash: 'pbkdf2$x',
                email_verified: 1,
                points: 0,
                is_instructor: 0,
                is_business: 0,
                metadata: JSON.stringify({ username: 'Google User', categories: [] }),
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

      const request = createMockRequest('https://example.com/api/v1/auth/sso', {
        method: 'POST',
        body: {
          provider: 'google',
          idToken: 'mock-google-id-token',
        },
      });

      const response = await authRoutes.signInWithSSO(request, env);
      const data = await parseJsonResponse(response);
      globalThis.fetch = originalFetch;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.token).toBeDefined();
      expect(userCreated).toBe(true);
    });

    it('should sign in existing SSO user', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ email: 'existing@example.com', name: 'Existing' }), {
          status: 200,
        });

      mockDb.prepare = (query: string) => {
        if (query.includes('SELECT * FROM users WHERE email')) {
          return {
            bind: () => ({
              first: async () => ({
                id: 'existing-user-123',
                email: 'existing@example.com',
                password_hash: 'pbkdf2$x',
                email_verified: 1,
                points: 50,
                is_instructor: 0,
                is_business: 0,
                metadata: JSON.stringify({
                  username: 'existinguser',
                  categories: ['fitness'],
                }),
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

      const request = createMockRequest('https://example.com/api/v1/auth/sso', {
        method: 'POST',
        body: {
          provider: 'google',
          idToken: 'mock-google-id-token',
        },
      });

      const response = await authRoutes.signInWithSSO(request, env);
      const data = await parseJsonResponse(response);
      globalThis.fetch = originalFetch;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe('existing-user-123');
    });
  });
});
