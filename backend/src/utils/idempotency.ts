/**
 * Idempotency-Key support for create endpoints (posts, journal, check-in, messages,
 * comments). A client retry with the same user + key within 24 h gets the stored
 * original response (status + body) instead of creating a duplicate.
 *
 * Flow: claim the key with INSERT OR IGNORE (status 0 = in flight) → run the handler
 * → store a 2xx response, or release the claim so the client can retry. A concurrent
 * duplicate that loses the claim gets 409 IDEMPOTENCY_IN_PROGRESS (retry shortly).
 */
import type { Env } from '../types';
import { getUserIdFromRequest } from './auth';
import { error } from './response';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** An in-flight claim older than this is treated as abandoned (crashed worker). */
const STALE_CLAIM_MS = 60 * 1000;
const CLEANUP_AFTER_MS = 2 * IDEMPOTENCY_TTL_MS;
const CLEANUP_PROBABILITY = 0.02;
const MAX_STORED_BODY = 64 * 1024;
const KEY_RE = /^[A-Za-z0-9_\-:.]{8,128}$/;

type KeyRow = { method: string; path: string; status: number; body: string | null; created_at: string };

function iso(msAgo = 0): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function changes(res: unknown): number {
  return Number((res as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0);
}

function replay(row: KeyRow): Response {
  return new Response(row.body ?? '', {
    status: row.status,
    headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
  });
}

async function claim(env: Env, userId: string, key: string, method: string, path: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO idempotency_keys (user_id, key, method, path, status, body, created_at)
     VALUES (?, ?, ?, ?, 0, NULL, ?)`
  )
    .bind(userId, key, method, path, iso())
    .run();
  return changes(res) === 1;
}

async function release(env: Env, userId: string, key: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM idempotency_keys WHERE user_id = ? AND key = ? AND status = 0`)
    .bind(userId, key)
    .run();
}

async function maybeCleanup(env: Env): Promise<void> {
  if (Math.random() >= CLEANUP_PROBABILITY) return;
  try {
    await env.DB.prepare(`DELETE FROM idempotency_keys WHERE created_at < ?`).bind(iso(CLEANUP_AFTER_MS)).run();
  } catch (err) {
    console.error('[idempotency] cleanup', err);
  }
}

/**
 * Wrap a create handler. Without the header (or without a valid session) the handler
 * runs as before; the handler itself still answers 401 for anonymous callers.
 */
export async function withIdempotency(
  request: Request,
  env: Env,
  handler: () => Promise<Response>
): Promise<Response> {
  const key = request.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!key) return handler();
  if (!KEY_RE.test(key)) {
    return error('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8–128 characters [A-Za-z0-9_-:.]', 400);
  }
  const userId = await getUserIdFromRequest(request, env);
  if (!userId) return handler();

  const method = request.method.toUpperCase();
  const path = new URL(request.url).pathname;

  let claimed = false;
  try {
    claimed = await claim(env, userId, key, method, path);
    if (!claimed) {
      const row = await env.DB.prepare(
        `SELECT method, path, status, body, created_at FROM idempotency_keys WHERE user_id = ? AND key = ?`
      )
        .bind(userId, key)
        .first<KeyRow>();
      const expired = row && row.created_at < iso(IDEMPOTENCY_TTL_MS);
      const abandoned = row && Number(row.status) === 0 && row.created_at < iso(STALE_CLAIM_MS);
      if (!row || expired || abandoned) {
        // Take over an expired/abandoned row: delete exactly what we saw, then claim.
        if (row) {
          await env.DB.prepare(
            `DELETE FROM idempotency_keys WHERE user_id = ? AND key = ? AND created_at = ?`
          )
            .bind(userId, key, row.created_at)
            .run();
        }
        claimed = await claim(env, userId, key, method, path);
        if (!claimed) {
          return error('IDEMPOTENCY_IN_PROGRESS', 'This request is already being processed.', 409);
        }
      } else if (row.method !== method || row.path !== path) {
        return error('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request.', 422);
      } else if (Number(row.status) === 0) {
        return error('IDEMPOTENCY_IN_PROGRESS', 'This request is already being processed.', 409);
      } else {
        return replay(row);
      }
    }
  } catch (err) {
    // Table missing (migration not applied yet) or transient DB error: never block the write.
    console.error('[idempotency] claim', err);
    return handler();
  }

  let response: Response;
  try {
    response = await handler();
  } catch (err) {
    await release(env, userId, key).catch(() => {});
    throw err;
  }

  try {
    if (response.status >= 200 && response.status < 300) {
      const body = await response.clone().text();
      if (body.length <= MAX_STORED_BODY) {
        await env.DB.prepare(
          `UPDATE idempotency_keys SET status = ?, body = ? WHERE user_id = ? AND key = ?`
        )
          .bind(response.status, body, userId, key)
          .run();
      } else {
        await release(env, userId, key);
      }
    } else {
      await release(env, userId, key);
    }
    await maybeCleanup(env);
  } catch (err) {
    console.error('[idempotency] store', err);
  }
  return response;
}
