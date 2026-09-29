import { Env } from '../types';

/**
 * Remove signups that were never verified after the 24h code window.
 * Unverified accounts stay until email_verification_expires_at — they are not
 * deleted when the user leaves the verify screen.
 */
export async function purgeExpiredUnverifiedUsers(env: Env): Promise<number> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `DELETE FROM users
     WHERE COALESCE(email_verified, 0) = 0
       AND email_verification_expires_at IS NOT NULL
       AND email_verification_expires_at < ?`
  )
    .bind(now)
    .run();
  return Number(result.meta?.changes ?? 0);
}
