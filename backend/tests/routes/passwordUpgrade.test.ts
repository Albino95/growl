import { describe, it, expect } from 'vitest';
import { createMockRequest, createMockEnv } from '../utils/test-helpers';
import * as authRoutes from '../../src/routes/auth';
import { hashClientSecret, verifyPassword } from '../../src/utils/password';

describe('legacy password hashes are upgraded on sign-in', () => {
  it('re-stores an unsalted SHA-256 hash as PBKDF2 that still verifies', async () => {
    const password = 'GrowlDemo123!';
    const clientHash = await hashClientSecret(password); // what the app sends
    const user: Record<string, unknown> = {
      id: 'demo-1',
      email: 'demo@growl.app',
      password_hash: clientHash, // legacy: SHA-256(password)
      email_verified: 1,
      points: 0,
      is_instructor: 0,
      is_business: 0,
      metadata: '{}',
    };
    const env = createMockEnv();
    env.DB = {
      prepare: (q: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => (q.includes('FROM users WHERE') ? { ...user } : null),
          all: async () => ({ results: [] }),
          run: async () => {
            if (q.startsWith('UPDATE users SET password_hash')) user.password_hash = args[0];
            return { meta: { changes: 1 } };
          },
        }),
      }),
    } as any;

    const res = await authRoutes.signIn(
      createMockRequest('https://api.test/api/v1/auth/sign-in', {
        method: 'POST',
        body: { email: 'demo@growl.app', password, passwordHash: clientHash }, // same as the app sends
      }),
      env
    );
    expect(res.status).toBe(200);
    expect(String(user.password_hash)).toMatch(/^pbkdf2\$/);
    // Both the current app (sends SHA-256) and plain-password clients still match.
    expect(await verifyPassword(clientHash, String(user.password_hash))).toBe(true);
    expect(await verifyPassword(await hashClientSecret(password), String(user.password_hash))).toBe(true);
    expect(await verifyPassword('wrong', String(user.password_hash))).toBe(false);
  });
});
