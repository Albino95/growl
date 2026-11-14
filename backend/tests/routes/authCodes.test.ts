/**
 * Email-verification / password-reset code hardening:
 * CSPRNG codes and a per-code wrong-guess limit enforced in the database.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMockRequest, createMockEnv, parseJsonResponse } from '../utils/test-helpers';
import * as authRoutes from '../../src/routes/auth';
import {
  generateVerificationToken,
  hashVerificationToken,
  MAX_CODE_ATTEMPTS,
} from '../../src/utils/password';
import type { Env } from '../../src/types';

type Row = {
  id: string;
  email: string;
  email_verified: number;
  email_verification_token_hash: string | null;
  email_verification_expires_at: string;
  email_verification_attempts: number;
  password_reset_token_hash: string | null;
  password_reset_expires_at: string;
  password_reset_attempts: number;
};

/** Minimal D1 stand-in that honours the attempt-counter UPDATE semantics. */
function fakeDb(row: Row) {
  return {
    prepare: (query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => (query.includes('FROM users WHERE email = ?') ? { ...row } : null),
        all: async () => ({ results: [] }),
        run: async () => {
          const m = query.match(/SET (\w+_attempts) = \1 \+ 1 WHERE id = \? AND \1 < \?/);
          if (m) {
            const col = m[1] as 'email_verification_attempts' | 'password_reset_attempts';
            if (row[col] < (args[1] as number)) {
              row[col] += 1;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (query.includes('SET email_verified = 1')) {
            row.email_verified = 1;
            row.email_verification_token_hash = null;
            row.email_verification_attempts = 0;
          }
          if (query.includes('password_reset_token_hash = NULL')) {
            row.password_reset_token_hash = null;
            row.password_reset_attempts = 0;
          }
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };
}

const inOneHour = () => new Date(Date.now() + 3600_000).toISOString();

describe('generateVerificationToken', () => {
  it('always returns a 6-digit code', () => {
    for (let i = 0; i < 2000; i += 1) {
      expect(generateVerificationToken()).toMatch(/^[1-9]\d{5}$/);
    }
  });
});

describe('verification and reset code attempt limits', () => {
  let env: Env;
  let row: Row;
  const CODE = '482913';

  beforeEach(async () => {
    env = createMockEnv();
    row = {
      id: 'user-1',
      email: 'a@example.com',
      email_verified: 0,
      email_verification_token_hash: await hashVerificationToken(CODE),
      email_verification_expires_at: inOneHour(),
      email_verification_attempts: 0,
      password_reset_token_hash: await hashVerificationToken(CODE),
      password_reset_expires_at: inOneHour(),
      password_reset_attempts: 0,
    };
    env.DB = fakeDb(row) as any;
  });

  const verify = (code: string) =>
    authRoutes.verifyEmail(
      createMockRequest('https://example.com/api/v1/auth/verify-email', {
        method: 'POST',
        body: { email: 'a@example.com', code },
      }),
      env
    );

  const reset = (code: string) =>
    authRoutes.resetPassword(
      createMockRequest('https://example.com/api/v1/auth/reset-password', {
        method: 'POST',
        body: { email: 'a@example.com', code, password: 'NewPassword!2026x' },
      }),
      env
    );

  it('accepts the correct verification code', async () => {
    const res = await verify(CODE);
    expect(res.status).toBe(200);
    expect(row.email_verified).toBe(1);
  });

  it('rejects a wrong verification code', async () => {
    const res = await verify('000000');
    expect(res.status).toBe(400);
    expect((await parseJsonResponse(res)).error.code).toBe('INVALID_CODE');
    expect(row.email_verified).toBe(0);
  });

  it(`locks verification after ${MAX_CODE_ATTEMPTS} wrong codes, even for the right code`, async () => {
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      expect((await verify('000000')).status).toBe(400);
    }
    const res = await verify(CODE);
    expect(res.status).toBe(429);
    expect((await parseJsonResponse(res)).error.code).toBe('TOO_MANY_ATTEMPTS');
    expect(row.email_verified).toBe(0);
  });

  it(`locks password reset after ${MAX_CODE_ATTEMPTS} wrong codes`, async () => {
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      expect((await reset('000000')).status).toBe(400);
    }
    const res = await reset(CODE);
    expect(res.status).toBe(429);
    expect(row.password_reset_token_hash).not.toBeNull();
  });

  it('accepts the correct reset code within the limit', async () => {
    await reset('000000');
    const res = await reset(CODE);
    expect(res.status).toBe(200);
    expect(row.password_reset_token_hash).toBeNull();
  });
});
