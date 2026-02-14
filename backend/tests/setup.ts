/**
 * Test setup file for Vitest
 * This runs before all tests
 */

import { beforeAll, afterAll } from 'vitest';

// Mock environment variables
process.env.ENVIRONMENT = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.API_VERSION = 'v1';

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
