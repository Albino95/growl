import { describe, expect, it } from 'vitest';
import { isProtectedReviewEmail, protectedReviewEmailsList } from '../reviewGuardrails';
import { isContentRemoveAction } from '../contentModeration';
import { adminMfaRequired, generateRecoveryCodes, hashRecoveryCode } from '../adminMfaCrypto';

describe('reviewGuardrails', () => {
  it('protects App Review and demo emails', () => {
    expect(isProtectedReviewEmail('review@growl.app')).toBe(true);
    expect(isProtectedReviewEmail('Review@Growl.app')).toBe(true);
    expect(isProtectedReviewEmail('demo@growl.app')).toBe(true);
    expect(isProtectedReviewEmail('user@example.com')).toBe(false);
    expect(protectedReviewEmailsList().length).toBeGreaterThanOrEqual(4);
  });
});

describe('contentModeration', () => {
  it('treats remove and hide as content remove actions', () => {
    expect(isContentRemoveAction('remove')).toBe(true);
    expect(isContentRemoveAction('hide')).toBe(true);
    expect(isContentRemoveAction('none')).toBe(false);
    expect(isContentRemoveAction(undefined)).toBe(false);
  });
});

describe('adminMfaCrypto', () => {
  it('keeps MFA required off unless env is true', () => {
    expect(adminMfaRequired({} as any)).toBe(false);
    expect(adminMfaRequired({ ADMIN_MFA_REQUIRED: 'false' } as any)).toBe(false);
    expect(adminMfaRequired({ ADMIN_MFA_REQUIRED: 'true' } as any)).toBe(true);
  });

  it('generates and hashes recovery codes stably', async () => {
    const codes = generateRecoveryCodes(3);
    expect(codes).toHaveLength(3);
    const h1 = await hashRecoveryCode(codes[0]);
    const h2 = await hashRecoveryCode(codes[0].toLowerCase());
    expect(h1).toBe(h2);
  });
});
