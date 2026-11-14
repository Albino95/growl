/**
 * AES-GCM encryption for admin MFA secrets at rest.
 * Key material: ADMIN_MFA_KEY if set, else JWT_SECRET (dev/QA fallback).
 */

import { Env } from '../types';

const PREFIX = 'enc:v1:';

async function materialKey(env: Env): Promise<CryptoKey> {
  const raw = (env.ADMIN_MFA_KEY || env.JWT_SECRET || 'growl-dev-mfa-key').trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromB64(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function encryptMfaSecret(env: Env, plaintext: string): Promise<string> {
  const key = await materialKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${toB64(iv)}:${toB64(new Uint8Array(cipher))}`;
}

/** Decrypt stored secret; plaintext legacy secrets (no prefix) pass through. */
export async function decryptMfaSecret(env: Env, stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) return stored;
  const rest = stored.slice(PREFIX.length);
  const [ivB64, cipherB64] = rest.split(':');
  if (!ivB64 || !cipherB64) throw new Error('Invalid MFA secret format');
  const key = await materialKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) },
    key,
    fromB64(cipherB64)
  );
  return new TextDecoder().decode(plain);
}

export function adminMfaRequired(env: Env): boolean {
  return String(env.ADMIN_MFA_REQUIRED || '').toLowerCase() === 'true';
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`.toUpperCase());
  }
  return codes;
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = code.replace(/\s+/g, '').toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
