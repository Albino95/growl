/**
 * Test helper utilities
 */

import type { Env } from '../../src/types';

/**
 * Create a mock environment for testing
 */
export function createMockEnv(): Env {
  return {
    DB: {
      prepare: (query: string) => ({
        bind: (...args: any[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
      }),
    } as any,
    KV: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as any,
    ENVIRONMENT: 'test',
    JWT_SECRET: 'test-secret-key',
    API_VERSION: 'v1',
    ALLOW_TEST_AUTH_BYPASS: 'true',
  } as Env;
}

/**
 * Create a mock request
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Request {
  const { method = 'GET', headers = {}, body } = options;

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Parse JSON response
 */
export async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

/**
 * Wait for a condition
 */
export function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}
