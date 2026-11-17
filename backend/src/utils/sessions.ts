/**
 * Create and revoke refresh token sessions in D1.
 */
import { Env } from '../types';
import { generateId } from './id';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TTL_SECONDS,
  signAccessToken,
} from './jwt';

/** A rotated refresh token presented again within this window gets the same new pair. */
export const REFRESH_GRACE_MS = 60 * 1000;

type SessionTokens = { token: string; refreshToken: string; expiresIn: number };

async function insertSession(env: Env, sessionId: string, userId: string, refreshToken: string): Promise<void> {
  const tokenHash = await hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO auth_refresh_sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();
}

export async function issueSessionTokens(env: Env, userId: string): Promise<SessionTokens> {
  const token = await signAccessToken(userId, env);
  const refreshToken = generateRefreshToken();
  await insertSession(env, generateId('rsess'), userId, refreshToken);
  return { token, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

// --- Grace payload: the replacement pair, AES-GCM encrypted with a key derived from
// the *old* raw refresh token. The DB only holds SHA-256(old token), so a DB reader
// cannot decrypt it; only a client presenting the old token can.

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function graceKey(oldRefreshToken: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`growl-refresh-grace:v1:${oldRefreshToken}`)
  );
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sealGrace(oldRefreshToken: string, pair: { token: string; refreshToken: string }): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await graceKey(oldRefreshToken),
    new TextEncoder().encode(JSON.stringify(pair))
  );
  return `${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

async function openGrace(
  oldRefreshToken: string,
  sealed: string
): Promise<{ token: string; refreshToken: string } | null> {
  try {
    const [iv, ct] = sealed.split('.');
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(iv) },
      await graceKey(oldRefreshToken),
      fromB64(ct)
    );
    const pair = JSON.parse(new TextDecoder().decode(pt));
    return typeof pair?.token === 'string' && typeof pair?.refreshToken === 'string' ? pair : null;
  } catch {
    return null;
  }
}

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  rotated_at: string | null;
  replaced_by: string | null;
  grace_payload: string | null;
};

async function loadSession(env: Env, tokenHash: string): Promise<SessionRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, expires_at, revoked_at, rotated_at, replaced_by, grace_payload
     FROM auth_refresh_sessions WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<SessionRow>();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Old token re-presented after rotation: within REFRESH_GRACE_MS, and while the
 * replacement session is still live, return the same replacement pair.
 */
async function graceReplay(
  env: Env,
  refreshToken: string,
  row: SessionRow
): Promise<({ userId: string } & SessionTokens) | null> {
  if (!row.rotated_at || !row.replaced_by || !row.grace_payload) return null;
  const age = Date.now() - Date.parse(row.rotated_at);
  if (!(age >= 0 && age <= REFRESH_GRACE_MS)) return null;
  // The winner of a concurrent rotation inserts the replacement right after claiming.
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = await env.DB.prepare(
      `SELECT revoked_at, expires_at FROM auth_refresh_sessions WHERE id = ?`
    )
      .bind(row.replaced_by)
      .first<{ revoked_at: string | null; expires_at: string }>();
    if (next) {
      if (next.revoked_at || new Date(next.expires_at).getTime() < Date.now()) return null;
      const pair = await openGrace(refreshToken, row.grace_payload);
      if (!pair) return null;
      return { userId: row.user_id, ...pair, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
    }
    if (attempt < 3) await sleep(100);
  }
  return null;
}

export async function rotateRefreshToken(
  env: Env,
  refreshToken: string
): Promise<({ userId: string } & SessionTokens) | null> {
  const tokenHash = await hashRefreshToken(refreshToken);
  const row = await loadSession(env, tokenHash);
  if (!row) return null;
  if (row.revoked_at) return graceReplay(env, refreshToken, row);
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  const token = await signAccessToken(row.user_id, env);
  const nextRefresh = generateRefreshToken();
  const nextSessionId = generateId('rsess');
  const sealed = await sealGrace(refreshToken, { token, refreshToken: nextRefresh });
  const now = new Date();

  // Atomic claim: only one concurrent caller flips revoked_at.
  const claim = await env.DB.prepare(
    `UPDATE auth_refresh_sessions
     SET revoked_at = datetime('now'), rotated_at = ?, replaced_by = ?, grace_payload = ?
     WHERE id = ? AND revoked_at IS NULL`
  )
    .bind(now.toISOString(), nextSessionId, sealed, row.id)
    .run();
  const claimed = Number((claim as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0) === 1;
  if (!claimed) {
    const fresh = await loadSession(env, tokenHash);
    return fresh?.revoked_at ? graceReplay(env, refreshToken, fresh) : null;
  }

  await insertSession(env, nextSessionId, row.user_id, nextRefresh);

  // Opportunistic: drop grace payloads that are past the window.
  try {
    await env.DB.prepare(
      `UPDATE auth_refresh_sessions SET grace_payload = NULL
       WHERE user_id = ? AND grace_payload IS NOT NULL AND rotated_at < ?`
    )
      .bind(row.user_id, new Date(now.getTime() - REFRESH_GRACE_MS).toISOString())
      .run();
  } catch {
    /* best effort */
  }

  return { userId: row.user_id, token, refreshToken: nextRefresh, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export async function revokeRefreshToken(env: Env, refreshToken: string): Promise<void> {
  const tokenHash = await hashRefreshToken(refreshToken);
  await env.DB.prepare(
    `UPDATE auth_refresh_sessions SET revoked_at = datetime('now')
     WHERE token_hash = ? AND revoked_at IS NULL`
  )
    .bind(tokenHash)
    .run();
}

export async function revokeAllUserRefreshTokens(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE auth_refresh_sessions SET revoked_at = datetime('now')
     WHERE user_id = ? AND revoked_at IS NULL`
  )
    .bind(userId)
    .run();
}
