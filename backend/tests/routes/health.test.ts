/**
 * Health check endpoint tests
 */

import { describe, it, expect } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import type { Env } from '../../src/types';

// Import the worker handler
import workerHandler from '../../src/index';

describe('Health Check Endpoint', () => {
  it('should return healthy status', async () => {
    const env = createMockEnv();
    
    // Mock successful database connection
    // The health check does: await env.DB.prepare('SELECT 1').first()
    // D1 prepare() returns an object with both bind() and first() methods
    env.DB = {
      prepare: (query: string) => {
        if (query === 'SELECT 1') {
          const result = { '1': 1 };
          return {
            bind: () => ({
              first: async () => result,
              all: async () => ({ results: [result] }),
              run: async () => ({ success: true }),
            }),
            first: async () => result, // Can be called directly
            all: async () => ({ results: [result] }),
            run: async () => ({ success: true }),
          };
        }
        return {
          bind: () => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ success: true }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        };
      },
    } as any;

    // Mock successful KV connection
    env.KV = {
      get: async () => null,
    } as any;

    const request = createMockRequest('https://example.com/api/v1/health', {
      method: 'GET',
    });

    const response = await workerHandler.fetch(request, env);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe('ok');
    expect(data.data.database).toBe('connected');
  });

  it('should handle database connection errors', async () => {
    const env = createMockEnv();
    
    // Mock database error
    env.DB = {
      prepare: () => {
        throw new Error('Database connection failed');
      },
    } as any;

    env.KV = {
      get: async () => null,
    } as any;

    const request = createMockRequest('https://example.com/api/v1/health', {
      method: 'GET',
    });

    const response = await workerHandler.fetch(request, env);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.database).toBe('error');
  });
});
