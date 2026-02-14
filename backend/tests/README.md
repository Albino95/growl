# Backend Testing Guide

This directory contains tests for the backend API using **Vitest**.

## Test Structure

```
tests/
├── routes/           # Route-specific unit tests
│   ├── auth.test.ts
│   └── health.test.ts
├── utils/           # Test utilities and helpers
│   └── test-helpers.ts
├── setup.ts         # Global test setup
└── test-api.js      # Integration tests (legacy)
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run integration tests (legacy script)
```bash
npm run test:integration
```

## Writing Tests

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { yourFunction } from '../../src/routes/your-route';
import { createMockRequest, createMockEnv } from '../utils/test-helpers';

describe('Your Feature', () => {
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
  });

  it('should do something', async () => {
    const request = createMockRequest('https://example.com/api/v1/endpoint', {
      method: 'POST',
      body: { /* test data */ },
    });

    const response = await yourFunction(request, env);
    const data = await parseJsonResponse(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
```

## Test Utilities

### `createMockEnv()`
Creates a mock environment with all required bindings (DB, KV, etc.)

### `createMockRequest(url, options)`
Creates a mock Request object for testing

### `parseJsonResponse(response)`
Parses a Response object and returns the JSON data

## Testing Best Practices

1. **Isolate tests**: Each test should be independent
2. **Mock external dependencies**: Mock database, KV, etc.
3. **Test both success and failure cases**
4. **Use descriptive test names**: "should do X when Y"
5. **Keep tests fast**: Unit tests should run quickly

## Integration Tests

The `test-api.js` file contains integration tests that test the actual deployed API. These are useful for:
- End-to-end testing
- Testing against real database
- Verifying deployment

Run with:
```bash
npm run test:integration
```

## Coverage

Generate coverage reports:
```bash
npm run test:coverage
```

Coverage reports are generated in `coverage/` directory.

## CI/CD Integration

Tests can be run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage
```
