import type { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import { canReplyAppReviews, listReviewInboxUserIds } from '../utils/appReviewAccess';

type ReviewRow = {
  id: string;
  user_id: string;
  stars: number;
  body: string;
  status: string;
  reply_body: string | null;
  reply_by: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  author_metadata?: string | null;
  author_email?: string | null;
};

function parseUsername(raw: string | null | undefined): string {
  try {
    const meta = JSON.parse(raw || '{}') as { username?: string };
    if (typeof meta.username === 'string' && meta.username.trim()) return meta.username.trim();
  } catch {
    /* ignore */
  }
  return 'Someone';
}

function mapReview(row: ReviewRow, viewerId: string, canReply: boolean) {
  const isMine = row.user_id === viewerId;
  return {
    id: row.id,
    stars: row.stars,
    body: row.body,
    created_at: row.created_at,
    updated_at: row.updated_at,
    author: {
      id: row.user_id,
      username: isMine ? 'You' : parseUsername(row.author_metadata),
    },
    mine: isMine,
    reply: row.reply_body
      ? {
          body: row.reply_body,
          at: row.replied_at,
          from: 'Grow! team',
        }
      : null,
    email: canReply && isMine === false ? row.author_email || null : null,
  };
}

function clampStars(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

function clampBody(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const body = raw.trim().replace(/\s+/g, ' ');
  if (body.length < 8 || body.length > 800) return null;
  return body;
}

async function loadReview(env: Env, id: string): Promise<ReviewRow | null> {
  return (await env.DB.prepare(
    `SELECT r.*, u.metadata AS author_metadata, u.email AS author_email
       FROM app_reviews r
       JOIN users u ON u.id = r.user_id
      WHERE r.id = ?`
  )
    .bind(id)
    .first<ReviewRow>()) as ReviewRow | null;
}

export async function listAppReviews(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const canReply = canReplyAppReviews(ctx.user, env);
  const statusClause = canReply ? '' : `WHERE r.status = 'published'`;

  try {
    const [list, mine, stats] = await Promise.all([
      env.DB.prepare(
        `SELECT r.*, u.metadata AS author_metadata, u.email AS author_email
           FROM app_reviews r
           JOIN users u ON u.id = r.user_id
           ${statusClause}
          ORDER BY CASE WHEN r.replied_at IS NULL THEN 0 ELSE 1 END, r.created_at DESC
          LIMIT 80`
      ).all<ReviewRow>(),
      env.DB.prepare(`SELECT * FROM app_reviews WHERE user_id = ?`)
        .bind(ctx.userId)
        .first<ReviewRow>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n, AVG(stars) AS avg_stars
           FROM app_reviews
          WHERE status = 'published'`
      ).first<{ n: number; avg_stars: number | null }>(),
    ]);

    const reviews = (list.results || []).map((row) => mapReview(row, ctx.userId!, canReply));
    return json({
      reviews,
      mine: mine ? mapReview({ ...mine, author_metadata: ctx.user.metadata }, ctx.userId, canReply) : null,
      can_reply: canReply,
      summary: {
        count: Number(stats?.n) || 0,
        avg: stats?.avg_stars != null ? Math.round(Number(stats.avg_stars) * 10) / 10 : null,
      },
    });
  } catch (err) {
    console.error('[listAppReviews]', err);
    return error('APP_REVIEWS_LIST_FAILED', 'Could not load reviews', 500);
  }
}

export async function upsertAppReview(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { stars?: unknown; body?: unknown };
  try {
    body = (await request.json()) as { stars?: unknown; body?: unknown };
  } catch {
    return error('INVALID_JSON', 'Invalid request body', 400);
  }

  const stars = clampStars(body.stars);
  const text = clampBody(body.body);
  if (stars == null) return error('INVALID_STARS', 'Pick 1 to 5 stars', 400);
  if (!text) return error('INVALID_BODY', 'Tell us a little more (8–800 characters)', 400);

  try {
    const existing = await env.DB.prepare(`SELECT id FROM app_reviews WHERE user_id = ?`)
      .bind(ctx.userId)
      .first<{ id: string }>();

    const id = existing?.id || generateId('areview');
    const isNew = !existing;

    if (existing) {
      await env.DB.prepare(
        `UPDATE app_reviews
            SET stars = ?, body = ?, status = 'published', updated_at = datetime('now')
          WHERE id = ?`
      )
        .bind(stars, text, id)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO app_reviews (id, user_id, stars, body, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'published', datetime('now'), datetime('now'))`
      )
        .bind(id, ctx.userId, stars, text)
        .run();
    }

    if (isNew) {
      const username = await resolveUsername(env, ctx.userId);
      const inbox = await listReviewInboxUserIds(env);
      await Promise.all(
        inbox.map((userId) =>
          createUserNotification(env, {
            userId,
            actorId: ctx.userId,
            type: 'app_review',
            title: `${username} reviewed Grow!`,
            body: `${stars}★ · ${text.slice(0, 80)}`,
            refType: 'app_review',
            refId: id,
          })
        )
      );
    }

    const row = await loadReview(env, id);
    return json({
      review: row ? mapReview(row, ctx.userId, canReplyAppReviews(ctx.user, env)) : null,
    });
  } catch (err) {
    console.error('[upsertAppReview]', err);
    return error('APP_REVIEW_SAVE_FAILED', 'Could not save your review', 500);
  }
}

export async function replyAppReview(request: Request, env: Env, reviewId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!canReplyAppReviews(ctx.user, env)) {
    return error('FORBIDDEN', 'Only the Grow! team can reply', 403);
  }

  let payload: { body?: unknown };
  try {
    payload = (await request.json()) as { body?: unknown };
  } catch {
    return error('INVALID_JSON', 'Invalid request body', 400);
  }

  const text = clampBody(payload.body);
  if (!text) return error('INVALID_BODY', 'Reply needs 8–800 characters', 400);

  const existing = await env.DB.prepare(`SELECT id, user_id FROM app_reviews WHERE id = ?`)
    .bind(reviewId)
    .first<{ id: string; user_id: string }>();
  if (!existing) return error('NOT_FOUND', 'Review not found', 404);

  try {
    await env.DB.prepare(
      `UPDATE app_reviews
          SET reply_body = ?, reply_by = ?, replied_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?`
    )
      .bind(text, ctx.userId, reviewId)
      .run();

    await createUserNotification(env, {
      userId: existing.user_id,
      actorId: ctx.userId,
      type: 'app_review_reply',
      title: 'Grow! replied to your review',
      body: text.slice(0, 120),
      refType: 'app_review',
      refId: reviewId,
    });

    const row = await loadReview(env, reviewId);
    return json({
      review: row ? mapReview(row, ctx.userId, true) : null,
    });
  } catch (err) {
    console.error('[replyAppReview]', err);
    return error('APP_REVIEW_REPLY_FAILED', 'Could not send reply', 500);
  }
}
