/**
 * Create and revoke refresh token sessions in D1.
 */
import { Env } from '../types';
import { generateId } from './id';
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
  signAccessToken,
} from './jwt';

export async function issueSessionTokens(
  env: Env,
  userId: string
): Promise<{ token: string; refreshToken: string; expiresIn: number }> {
  const token = await signAccessToken(userId, env);
  const refreshToken = generateRefreshToken();
  const tokenHash = await hashRefreshToken(refreshToken);
  const sessionId = generateId('rsess');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO auth_refresh_sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();

  return { token, refreshToken, expiresIn: 3600 };
}

export async function rotateRefreshToken(
  env: Env,
  refreshToken: string
): Promise<{ userId: string; token: string; refreshToken: string; expiresIn: number } | null> {
  const tokenHash = await hashRefreshToken(refreshToken);
  const row = await env.DB.prepare(
    `SELECT id, user_id, expires_at, revoked_at FROM auth_refresh_sessions WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>();

  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  await env.DB.prepare(
    `UPDATE auth_refresh_sessions SET revoked_at = datetime('now') WHERE id = ?`
  )
    .bind(row.id)
    .run();

  const next = await issueSessionTokens(env, row.user_id);
  return { userId: row.user_id, ...next };
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
