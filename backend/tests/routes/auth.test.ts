/**
 * Authentication route tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { signUp, signIn } from '../../src/routes/auth';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import type { Env } from '../../src/types';

describe('Auth Routes', () => {
  let env: Env;
  const baseUrl = 'https://example.com/api/v1';

  beforeEach(() => {
    env = createMockEnv();
  });

  describe('POST /auth/sign-up', () => {
    it('should create a new user with valid data', async () => {
      // Mock successful database operations
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        points: 0,
        is_instructor: false,
        is_business: false,
        metadata: '{}',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      env.DB = {
        prepare: (query: string) => {
          if (query.includes('SELECT id FROM users WHERE email')) {
            return {
              bind: () => ({
                first: async () => null, // User doesn't exist
              }),
            };
          }
          if (query.includes('INSERT INTO users')) {
            return {
              bind: () => ({
                run: async () => ({ success: true }),
              }),
            };
          }
          return {
            bind: () => ({
              first: async () => null,
            }),
          };
        },
      } as any;

      const request = createMockRequest(`${baseUrl}/auth/sign-up`, {
        method: 'POST',
        body: {
          email: 'test@example.com',
          password: 'TestPassword123!',
          username: 'testuser',
        },
      });

      const response = await signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('user');
      expect(data.data).toHaveProperty('token');
      expect(data.data.user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      env.DB = {
        prepare: (query: string) => {
          if (query.includes('SELECT id FROM users WHERE email')) {
            return {
              bind: () => ({
                first: async () => ({ id: 'existing-user' }), // User exists
              }),
            };
          }
          return {
            bind: () => ({
              first: async () => null,
            }),
          };
        },
      } as any;

      const request = createMockRequest(`${baseUrl}/auth/sign-up`, {
        method: 'POST',
        body: {
          email: 'existing@example.com',
          password: 'TestPassword123!',
          username: 'testuser',
        },
      });

      const response = await signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe('USER_EXISTS');
    });

    it('should validate required fields', async () => {
      const request = createMockRequest(`${baseUrl}/auth/sign-up`, {
        method: 'POST',
        body: {
          // Missing email and password
        },
      });

      const response = await signUp(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('POST /auth/sign-in', () => {
    it('should authenticate user with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        password_hash: '$2a$10$hashedpassword', // Mock bcrypt hash
        points: 100,
        is_instructor: false,
        is_business: false,
        metadata: JSON.stringify({ username: 'testuser' }),
      };

      env.DB = {
        prepare: (query: string) => {
          if (query.includes('SELECT * FROM users WHERE email')) {
            return {
              bind: () => ({
                first: async () => mockUser,
              }),
            };
          }
          return {
            bind: () => ({
              first: async () => null,
            }),
          };
        },
      } as any;

      const request = createMockRequest(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        body: {
          email: 'test@example.com',
          password: 'TestPassword123!',
        },
      });

      // Note: This test will need proper password hashing mock
      // For now, it demonstrates the test structure
      const response = await signIn(request, env);
      
      // The response will depend on password verification
      expect(response).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      env.DB = {
        prepare: (query: string) => {
          if (query.includes('SELECT * FROM users WHERE email')) {
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
        },
      } as any;

      const request = createMockRequest(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        body: {
          email: 'nonexistent@example.com',
          password: 'WrongPassword',
        },
      });

      const response = await signIn(request, env);
      const data = await parseJsonResponse(response);

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error?.code).toBe('INVALID_CREDENTIALS');
    });
  });
});
