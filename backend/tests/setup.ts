/**
 * Test setup file for Vitest
 * This runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';

// Mock environment variables
process.env.ENVIRONMENT = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.API_VERSION = 'v1';

// Ensure global crypto.getRandomValues exists for libraries that expect Web Crypto
if (!(globalThis as any).crypto || typeof (globalThis as any).crypto.getRandomValues !== 'function') {
  (globalThis as any).crypto = webcrypto as any;
}

// Setup before all tests
beforeAll(() => {
  // Any global setup
  console.log('🧪 Setting up test environment...');
});

// Cleanup after all tests
afterAll(() => {
  // Any global cleanup
  console.log('🧹 Cleaning up test environment...');
});
