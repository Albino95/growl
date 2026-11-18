import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { validateRequest } from '../../utils/validation';
import { withIdempotency } from '../../utils/idempotency';
import { checkRateLimit } from '../../utils/rateLimit';
import { createUserNotification } from '../../utils/notifications';
import { safeTimeZone } from '../../utils/days';
import { isBlocked } from '../friends';
import { createBusinessNotification } from '../business';

/**
 * Wave 6 engagement module (bizengage).
 *
 * Public / customer:
 *   GET    {api}/products/:id/questions             → { questions }
 *   POST   {api}/products/:id/questions             { body ≤300 } → { question }
 *   GET    {api}/products/:id/reviews               → { average, count, reviews, viewer }
 *   POST   {api}/products/:id/reviews               { rating, body ≤600 } (delivered order required)
 *   POST   {api}/product-questions/:id/report       { reason } → { ok }
 *   POST   {api}/product-reviews/:id/report         { reason } → { ok }
 *
 * Business (owner of the product):
 *   GET    {api}/business/questions?status=unanswered|all → { questions }
 *   POST   {api}/business/questions/:qid/answer     { body ≤600 } → { question }
 *   DELETE {api}/business/questions/:qid            → { hidden: true }
 *   GET    {api}/business/reviews?status=unreplied|all → { reviews }
 *   POST   {api}/business/reviews/:rid/reply        { body ≤600 } → { review }
 *   GET    {api}/business/engage/summary            → { unanswered_questions, unreplied_reviews }
 *   GET    {api}/business/inbox-settings            → { saved_replies, away }
 *   PUT    {api}/business/inbox-settings            partial { saved_replies, away } → same
 *
 * Hook: maybeSendAwayReply(env, conversationId, senderId, recipientId) — called from
 * messages.sendMessage after a successful send.
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const m = request.method;

  const prod = path.match(new RegExp(`^${apiPrefix}/products/([^/]+)/(questions|reviews)$`));
  if (prod) {
    const productId = decodeURIComponent(prod[1]);
    if (prod[2] === 'questions') {
      if (m === 'GET') return listProductQuestions(request, env, productId);
      if (m === 'POST') return withIdempotency(request, env, () => askQuestion(request, env, productId));
    } else {
      if (m === 'GET') return listProductReviews(request, env, productId);
      if (m === 'POST') return withIdempotency(request, env, () => writeReview(request, env, productId));
    }
    return null;
  }

  const rep = path.match(new RegExp(`^${apiPrefix}/product-(questions|reviews)/([^/]+)/report$`));
  if (rep && m === 'POST') {
    return reportItem(request, env, rep[1] === 'questions' ? 'question' : 'review', decodeURIComponent(rep[2]));
  }

  if (!path.startsWith(`${apiPrefix}/business/`)) return null;
  const rest = path.slice(`${apiPrefix}/business`.length);

  if (rest === '/questions' && m === 'GET') return listBusinessQuestions(request, env);
  if (rest === '/reviews' && m === 'GET') return listBusinessReviews(request, env);
  if (rest === '/engage/summary' && m === 'GET') return getSummary(request, env);
  if (rest === '/inbox-settings') {
    if (m === 'GET') return getInboxSettings(request, env);
    if (m === 'PUT') return putInboxSettings(request, env);
    return null;
  }

  const ans = rest.match(/^\/questions\/([^/]+)\/answer$/);
  if (ans && m === 'POST') return answerQuestion(request, env, decodeURIComponent(ans[1]));
  const q = rest.match(/^\/questions\/([^/]+)$/);
  if (q && m === 'DELETE') return hideQuestion(request, env, decodeURIComponent(q[1]));
  const rr = rest.match(/^\/reviews\/([^/]+)\/reply$/);
  if (rr && m === 'POST') return replyToReview(request, env, decodeURIComponent(rr[1]));

  return null;
}

/** No scheduled work for this module. */
export async function runCron(_env: Env, _now: Date): Promise<void> {}

// ---------------------------------------------------------------------------
// Limits & schemas

export const QUESTION_MAX = 300;
export const ANSWER_MAX = 600;
export const REVIEW_MAX = 600;
export const SAVED_REPLIES_MAX = 20;
export const AWAY_MESSAGE_MAX = 300;
export const AWAY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const LIST_LIMIT = 100;
const IN_CHUNK = 90;

const questionSchema = z.object({ body: z.string().trim().min(3).max(QUESTION_MAX) });
const answerSchema = z.object({ body: z.string().trim().min(1).max(ANSWER_MAX) });
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(REVIEW_MAX).optional().default(''),
});
const replySchema = z.object({ body: z.string().trim().min(1).max(ANSWER_MAX) });
const reportSchema = z.object({ reason: z.string().trim().min(1).max(500) });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const scheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  from: z.string().regex(HHMM),
  to: z.string().regex(HHMM),
});
export type AwaySchedule = z.infer<typeof scheduleSchema>;

const inboxSettingsSchema = z.object({
  saved_replies: z
    .array(
      z.object({
        id: z.string().trim().max(64).optional(),
        title: z.string().trim().min(1).max(40),
        body: z.string().trim().min(1).max(1000),
      })
    )
    .max(SAVED_REPLIES_MAX)
    .optional(),
  away: z
    .object({
      enabled: z.boolean(),
      message: z.string().trim().max(AWAY_MESSAGE_MAX),
      schedule: scheduleSchema.nullable().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Shared helpers

type Person = { id: string; name: string; avatar_url: string | null };

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadPeople(env: Env, ids: string[]): Promise<Map<string, Person>> {
  const map = new Map<string, Person>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (const part of chunk(unique)) {
    const rows = await env.DB.prepare(
      `SELECT id, metadata FROM users WHERE id IN (${part.map(() => '?').join(',')})`
    )
      .bind(...part)
      .all<{ id: string; metadata: string | null }>();
    for (const r of rows.results || []) {
      const meta = parseJson<Record<string, unknown>>(r.metadata, {});
      map.set(r.id, {
        id: r.id,
        name: str(meta.display_name) || str(meta.name) || str(meta.username) || 'Member',
        avatar_url: str(meta.avatar_url) || str(meta.avatar),
      });
    }
  }
  return map;
}

function personOr(map: Map<string, Person>, id: string): Person {
  return map.get(id) ?? { id, name: 'Member', avatar_url: null };
}

/** Everyone the viewer has blocked or been blocked by. */
async function blockedWith(env: Env, viewerId: string | null | undefined): Promise<Set<string>> {
  if (!viewerId) return new Set();
  const rows = await env.DB.prepare(
    `SELECT user_id, target_user_id FROM user_relationships
     WHERE type = 'block' AND (user_id = ? OR target_user_id = ?)`
  )
    .bind(viewerId, viewerId)
    .all<{ user_id: string; target_user_id: string }>();
  const out = new Set<string>();
  for (const r of rows.results || []) out.add(r.user_id === viewerId ? r.target_user_id : r.user_id);
  return out;
}

type ProductRow = { id: string; user_id: string; name: string; image_url: string | null };

async function visibleProduct(env: Env, productId: string): Promise<ProductRow | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, name, image_url FROM products WHERE id = ? AND COALESCE(is_hidden, 0) = 0`
    )
      .bind(productId)
      .first<ProductRow>()) ?? null
  );
}

async function viewer(request: Request, env: Env) {
  const ctx = await getRequestContext(request, env);
  return ctx.isAuthenticated && ctx.userId ? { userId: ctx.userId, user: ctx.user } : null;
}

type BizCtx = { userId: string };

async function requireBusiness(request: Request, env: Env): Promise<BizCtx | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return error('UNAUTHORIZED', 'Authentication required', 401);
  if (!ctx.user?.is_business) return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  return { userId: ctx.userId };
}

function clip(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ---------------------------------------------------------------------------
// Questions

type QuestionRow = {
  id: string;
  product_id: string;
  business_id: string;
  asker_id: string;
  body: string;
  created_at: string;
  answer_body: string | null;
  answered_at: string | null;
};

const QUESTION_SELECT = `SELECT q.id, q.product_id, q.business_id, q.asker_id, q.body, q.created_at,
    a.body AS answer_body, a.answered_at
  FROM product_questions q LEFT JOIN product_answers a ON a.question_id = q.id`;

function questionOut(r: QuestionRow, people: Map<string, Person>, viewerId?: string | null) {
  return {
    id: r.id,
    product_id: r.product_id,
    body: r.body,
    asker: personOr(people, r.asker_id),
    created_at: r.created_at,
    mine: !!viewerId && viewerId === r.asker_id,
    answer: r.answer_body ? { body: r.answer_body, answered_at: r.answered_at } : undefined,
  };
}

async function listProductQuestions(request: Request, env: Env, productId: string): Promise<Response> {
  try {
    const product = await visibleProduct(env, productId);
    if (!product) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const me = await viewer(request, env);
    const blocked = await blockedWith(env, me?.userId);
    if (me && blocked.has(product.user_id)) return json({ questions: [] });
    const rows = await env.DB.prepare(
      `${QUESTION_SELECT} WHERE q.product_id = ? AND q.hidden_at IS NULL
       ORDER BY (a.body IS NULL) ASC, q.created_at DESC LIMIT ?`
    )
      .bind(productId, LIST_LIMIT)
      .all<QuestionRow>();
    const list = (rows.results || []).filter((r) => !blocked.has(r.asker_id));
    // Unanswered questions are only shown to their asker and the business.
    const shown = list.filter((r) => r.answer_body || r.asker_id === me?.userId || product.user_id === me?.userId);
    const people = await loadPeople(env, shown.map((r) => r.asker_id));
    return json({ questions: shown.map((r) => questionOut(r, people, me?.userId)) });
  } catch (err) {
    console.error('[bizengage.listProductQuestions]', err);
    return error('DATABASE_ERROR', 'Failed to load questions', 500);
  }
}

async function askQuestion(request: Request, env: Env, productId: string): Promise<Response> {
  const me = await viewer(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const v = await validateRequest(request, questionSchema);
  if (!v.success) return v.response;
  try {
    const product = await visibleProduct(env, productId);
    if (!product) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    if (product.user_id === me.userId) return error('OWN_PRODUCT', 'You can’t ask about your own product', 403);
    if (await isBlocked(env, me.userId, product.user_id)) {
      return error('BLOCKED', 'You can’t ask this business a question', 403);
    }
    const rl = await checkRateLimit(env, `pq:${me.userId}`, 10, 3600);
    if (!rl.allowed) return error('RATE_LIMITED', 'You’ve asked a lot of questions. Try again later.', 429);

    const id = generateId('pq');
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO product_questions (id, product_id, business_id, asker_id, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, productId, product.user_id, me.userId, v.data.body, now)
      .run();

    await createUserNotification(env, {
      userId: product.user_id,
      actorId: me.userId,
      type: 'product_question',
      title: `New question about ${clip(product.name, 60)}`,
      body: clip(v.data.body, 140),
      refType: 'product',
      refId: productId,
    });
    // Business hub action inbox (respects the shop's in-app alerts switch).
    await createBusinessNotification(
      env,
      product.user_id,
      'product_question',
      `New question about ${clip(product.name, 60)}`,
      clip(v.data.body, 140),
      { ref_type: 'product_question', ref_id: id }
    );

    const row = await env.DB.prepare(`${QUESTION_SELECT} WHERE q.id = ?`).bind(id).first<QuestionRow>();
    const people = await loadPeople(env, [me.userId]);
    return json({ question: questionOut(row!, people, me.userId) }, 201);
  } catch (err) {
    console.error('[bizengage.askQuestion]', err);
    return error('DATABASE_ERROR', 'Failed to post question', 500);
  }
}

async function loadOwnQuestion(env: Env, businessId: string, qid: string) {
  return env.DB.prepare(
    `SELECT q.id, q.product_id, q.asker_id, q.hidden_at, p.user_id AS owner_id, p.name AS product_name
     FROM product_questions q JOIN products p ON p.id = q.product_id WHERE q.id = ?`
  )
    .bind(qid)
    .first<{
      id: string;
      product_id: string;
      asker_id: string;
      hidden_at: string | null;
      owner_id: string;
      product_name: string;
    }>()
    .then((r) => (r && r.owner_id === businessId ? r : null));
}

async function answerQuestion(request: Request, env: Env, qid: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const v = await validateRequest(request, answerSchema);
  if (!v.success) return v.response;
  try {
    const q = await loadOwnQuestion(env, auth.userId, qid);
    if (!q || q.hidden_at) return error('NOT_FOUND', 'Question not found', 404);
    const now = new Date().toISOString();
    const existing = await env.DB.prepare('SELECT 1 AS ok FROM product_answers WHERE question_id = ?')
      .bind(qid)
      .first();
    await env.DB.prepare(
      `INSERT INTO product_answers (question_id, business_id, body, answered_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
    )
      .bind(qid, auth.userId, v.data.body, now, now)
      .run();

    if (!existing) {
      await createUserNotification(env, {
        userId: q.asker_id,
        actorId: auth.userId,
        type: 'product_answer',
        title: `Your question about ${clip(q.product_name, 60)} was answered`,
        body: clip(v.data.body, 140),
        refType: 'product',
        refId: q.product_id,
      });
    }

    const row = await env.DB.prepare(`${QUESTION_SELECT} WHERE q.id = ?`).bind(qid).first<QuestionRow>();
    const people = await loadPeople(env, [row!.asker_id]);
    return json({ question: questionOut(row!, people, auth.userId) });
  } catch (err) {
    console.error('[bizengage.answerQuestion]', err);
    return error('DATABASE_ERROR', 'Failed to save answer', 500);
  }
}

async function hideQuestion(request: Request, env: Env, qid: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const q = await loadOwnQuestion(env, auth.userId, qid);
    if (!q) return error('NOT_FOUND', 'Question not found', 404);
    await env.DB.prepare(`UPDATE product_questions SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?`)
      .bind(new Date().toISOString(), qid)
      .run();
    return json({ hidden: true });
  } catch (err) {
    console.error('[bizengage.hideQuestion]', err);
    return error('DATABASE_ERROR', 'Failed to hide question', 500);
  }
}

async function listBusinessQuestions(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const status = new URL(request.url).searchParams.get('status') === 'all' ? 'all' : 'unanswered';
  try {
    const blocked = await blockedWith(env, auth.userId);
    const rows = await env.DB.prepare(
      `${QUESTION_SELECT} WHERE q.business_id = ? AND q.hidden_at IS NULL
       ${status === 'unanswered' ? 'AND a.body IS NULL' : ''}
       ORDER BY q.created_at DESC LIMIT ?`
    )
      .bind(auth.userId, LIST_LIMIT)
      .all<QuestionRow>();
    const list = (rows.results || []).filter((r) => !blocked.has(r.asker_id));
    const people = await loadPeople(env, list.map((r) => r.asker_id));
    const products = await loadProducts(env, list.map((r) => r.product_id));
    return json({
      status,
      questions: list.map((r) => ({ ...questionOut(r, people), product: products.get(r.product_id) ?? null })),
    });
  } catch (err) {
    console.error('[bizengage.listBusinessQuestions]', err);
    return error('DATABASE_ERROR', 'Failed to load questions', 500);
  }
}

async function loadProducts(env: Env, ids: string[]) {
  const map = new Map<string, { id: string; name: string; image_url: string | null }>();
  for (const part of chunk([...new Set(ids)])) {
    const rows = await env.DB.prepare(
      `SELECT id, name, image_url FROM products WHERE id IN (${part.map(() => '?').join(',')})`
    )
      .bind(...part)
      .all<{ id: string; name: string; image_url: string | null }>();
    for (const r of rows.results || []) map.set(r.id, r);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Reviews

type ReviewRow = {
  id: string;
  product_id: string;
  business_id: string;
  author_id: string;
  rating: number;
  body: string;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  reply_body: string | null;
  replied_at: string | null;
};

const REVIEW_SELECT = `SELECT r.id, r.product_id, r.business_id, r.author_id, r.rating, r.body, r.order_id,
    r.created_at, r.updated_at, rr.body AS reply_body, rr.replied_at
  FROM product_reviews r LEFT JOIN review_replies rr ON rr.review_id = r.id`;

function reviewOut(r: ReviewRow, people: Map<string, Person>, viewerId?: string | null) {
  return {
    id: r.id,
    product_id: r.product_id,
    rating: Number(r.rating),
    body: r.body,
    author: personOr(people, r.author_id),
    created_at: r.created_at,
    updated_at: r.updated_at,
    verified_purchase: !!r.order_id,
    mine: !!viewerId && viewerId === r.author_id,
    reply: r.reply_body ? { body: r.reply_body, replied_at: r.replied_at } : undefined,
  };
}

/** The most recent delivered/completed order of this product by this user, if any. */
export async function deliveredOrderFor(env: Env, userId: string, productId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT o.id FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = ? AND oi.product_id = ? AND o.status IN ('delivered', 'completed')
     ORDER BY o.created_at DESC LIMIT 1`
  )
    .bind(userId, productId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function listProductReviews(request: Request, env: Env, productId: string): Promise<Response> {
  try {
    const product = await visibleProduct(env, productId);
    if (!product) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const me = await viewer(request, env);
    const blocked = await blockedWith(env, me?.userId);

    const stats = await env.DB.prepare(
      `SELECT COUNT(*) AS n, AVG(rating) AS avg FROM product_reviews WHERE product_id = ? AND hidden_at IS NULL`
    )
      .bind(productId)
      .first<{ n: number; avg: number | null }>();
    const rows = await env.DB.prepare(
      `${REVIEW_SELECT} WHERE r.product_id = ? AND r.hidden_at IS NULL ORDER BY r.created_at DESC LIMIT ?`
    )
      .bind(productId, LIST_LIMIT)
      .all<ReviewRow>();
    const list = (rows.results || []).filter((r) => !blocked.has(r.author_id));
    const people = await loadPeople(env, list.map((r) => r.author_id));

    let viewerState: { can_review: boolean; reason: string | null; my_review_id: string | null };
    if (!me) viewerState = { can_review: false, reason: 'signed_out', my_review_id: null };
    else if (me.userId === product.user_id) viewerState = { can_review: false, reason: 'own_product', my_review_id: null };
    else if (blocked.has(product.user_id)) viewerState = { can_review: false, reason: 'blocked', my_review_id: null };
    else {
      const mine = await env.DB.prepare('SELECT id FROM product_reviews WHERE product_id = ? AND author_id = ?')
        .bind(productId, me.userId)
        .first<{ id: string }>();
      const order = await deliveredOrderFor(env, me.userId, productId);
      viewerState = {
        can_review: !!order,
        reason: order ? null : 'needs_purchase',
        my_review_id: mine?.id ?? null,
      };
    }

    const count = Number(stats?.n || 0);
    return json({
      average: count ? Math.round(Number(stats?.avg || 0) * 10) / 10 : 0,
      count,
      reviews: list.map((r) => reviewOut(r, people, me?.userId)),
      viewer: viewerState,
    });
  } catch (err) {
    console.error('[bizengage.listProductReviews]', err);
    return error('DATABASE_ERROR', 'Failed to load reviews', 500);
  }
}

async function writeReview(request: Request, env: Env, productId: string): Promise<Response> {
  const me = await viewer(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const v = await validateRequest(request, reviewSchema);
  if (!v.success) return v.response;
  try {
    const product = await visibleProduct(env, productId);
    if (!product) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    if (product.user_id === me.userId) return error('OWN_PRODUCT', 'You can’t review your own product', 403);
    if (await isBlocked(env, me.userId, product.user_id)) {
      return error('BLOCKED', 'You can’t review this business', 403);
    }
    const orderId = await deliveredOrderFor(env, me.userId, productId);
    if (!orderId) {
      return error('REVIEW_NEEDS_PURCHASE', 'Reviews open after your order of this product is delivered', 403);
    }
    const rl = await checkRateLimit(env, `pr:${me.userId}`, 20, 3600);
    if (!rl.allowed) return error('RATE_LIMITED', 'Too many reviews. Try again later.', 429);

    const now = new Date().toISOString();
    const existing = await env.DB.prepare(
      'SELECT id FROM product_reviews WHERE product_id = ? AND author_id = ?'
    )
      .bind(productId, me.userId)
      .first<{ id: string }>();
    const id = existing?.id ?? generateId('prev');
    if (existing) {
      await env.DB.prepare(
        `UPDATE product_reviews SET rating = ?, body = ?, order_id = ?, updated_at = ? WHERE id = ?`
      )
        .bind(v.data.rating, v.data.body, orderId, now, id)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO product_reviews (id, product_id, business_id, author_id, rating, body, order_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(id, productId, product.user_id, me.userId, v.data.rating, v.data.body, orderId, now, now)
        .run();
      await createUserNotification(env, {
        userId: product.user_id,
        actorId: me.userId,
        type: 'product_review',
        title: `New ${v.data.rating}-star review on ${clip(product.name, 60)}`,
        body: v.data.body ? clip(v.data.body, 140) : null,
        refType: 'product',
        refId: productId,
      });
      await createBusinessNotification(
        env,
        product.user_id,
        'product_review',
        `New ${v.data.rating}-star review on ${clip(product.name, 60)}`,
        v.data.body ? clip(v.data.body, 140) : null,
        { ref_type: 'product_review', ref_id: id }
      );
    }
    const row = await env.DB.prepare(`${REVIEW_SELECT} WHERE r.id = ?`).bind(id).first<ReviewRow>();
    const people = await loadPeople(env, [me.userId]);
    return json({ review: reviewOut(row!, people, me.userId) }, existing ? 200 : 201);
  } catch (err) {
    console.error('[bizengage.writeReview]', err);
    return error('DATABASE_ERROR', 'Failed to save review', 500);
  }
}

async function replyToReview(request: Request, env: Env, rid: string): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const v = await validateRequest(request, replySchema);
  if (!v.success) return v.response;
  try {
    const review = await env.DB.prepare(
      `SELECT r.id, r.author_id, r.product_id, r.hidden_at, p.user_id AS owner_id, p.name AS product_name
       FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE r.id = ?`
    )
      .bind(rid)
      .first<{ id: string; author_id: string; product_id: string; hidden_at: string | null; owner_id: string; product_name: string }>();
    if (!review || review.owner_id !== auth.userId || review.hidden_at) {
      return error('NOT_FOUND', 'Review not found', 404);
    }
    const now = new Date().toISOString();
    const existing = await env.DB.prepare('SELECT 1 AS ok FROM review_replies WHERE review_id = ?').bind(rid).first();
    await env.DB.prepare(
      `INSERT INTO review_replies (review_id, business_id, body, replied_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(review_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
    )
      .bind(rid, auth.userId, v.data.body, now, now)
      .run();
    if (!existing) {
      await createUserNotification(env, {
        userId: review.author_id,
        actorId: auth.userId,
        type: 'review_reply',
        title: `The shop replied to your review of ${clip(review.product_name, 60)}`,
        body: clip(v.data.body, 140),
        refType: 'product',
        refId: review.product_id,
      });
    }
    const row = await env.DB.prepare(`${REVIEW_SELECT} WHERE r.id = ?`).bind(rid).first<ReviewRow>();
    const people = await loadPeople(env, [row!.author_id]);
    return json({ review: reviewOut(row!, people) });
  } catch (err) {
    console.error('[bizengage.replyToReview]', err);
    return error('DATABASE_ERROR', 'Failed to save reply', 500);
  }
}

async function listBusinessReviews(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const status = new URL(request.url).searchParams.get('status') === 'all' ? 'all' : 'unreplied';
  try {
    const blocked = await blockedWith(env, auth.userId);
    const rows = await env.DB.prepare(
      `${REVIEW_SELECT} WHERE r.business_id = ? AND r.hidden_at IS NULL
       ${status === 'unreplied' ? 'AND rr.body IS NULL' : ''}
       ORDER BY r.created_at DESC LIMIT ?`
    )
      .bind(auth.userId, LIST_LIMIT)
      .all<ReviewRow>();
    const list = (rows.results || []).filter((r) => !blocked.has(r.author_id));
    const people = await loadPeople(env, list.map((r) => r.author_id));
    const products = await loadProducts(env, list.map((r) => r.product_id));
    return json({
      status,
      reviews: list.map((r) => ({ ...reviewOut(r, people), product: products.get(r.product_id) ?? null })),
    });
  } catch (err) {
    console.error('[bizengage.listBusinessReviews]', err);
    return error('DATABASE_ERROR', 'Failed to load reviews', 500);
  }
}

async function getSummary(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const notBlocked = (col: string) =>
      `NOT EXISTS (SELECT 1 FROM user_relationships ur WHERE ur.type = 'block'
         AND ((ur.user_id = ? AND ur.target_user_id = ${col}) OR (ur.user_id = ${col} AND ur.target_user_id = ?)))`;
    const me = auth.userId;
    const row = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM product_questions q
            WHERE q.business_id = ? AND q.hidden_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM product_answers a WHERE a.question_id = q.id)
              AND ${notBlocked('q.asker_id')}) AS uq,
         (SELECT COUNT(*) FROM product_reviews r
            WHERE r.business_id = ? AND r.hidden_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM review_replies rr WHERE rr.review_id = r.id)
              AND ${notBlocked('r.author_id')}) AS ur`
    )
      .bind(me, me, me, me, me, me)
      .first<{ uq: number; ur: number }>();
    return json({ unanswered_questions: Number(row?.uq || 0), unreplied_reviews: Number(row?.ur || 0) });
  } catch (err) {
    console.error('[bizengage.getSummary]', err);
    return error('DATABASE_ERROR', 'Failed to load summary', 500);
  }
}

// ---------------------------------------------------------------------------
// Reports (stored in the existing moderation `reports` table as a report on the author,
// with the question / review in details so admins see the exact text).

async function reportItem(
  request: Request,
  env: Env,
  kind: 'question' | 'review',
  itemId: string
): Promise<Response> {
  const me = await viewer(request, env);
  if (!me) return error('UNAUTHORIZED', 'Authentication required', 401);
  const v = await validateRequest(request, reportSchema);
  if (!v.success) return v.response;
  try {
    const row =
      kind === 'question'
        ? await env.DB.prepare('SELECT id, product_id, asker_id AS author_id, body FROM product_questions WHERE id = ?')
            .bind(itemId)
            .first<{ id: string; product_id: string; author_id: string; body: string }>()
        : await env.DB.prepare('SELECT id, product_id, author_id, body FROM product_reviews WHERE id = ?')
            .bind(itemId)
            .first<{ id: string; product_id: string; author_id: string; body: string }>();
    if (!row) return error('NOT_FOUND', 'Not found', 404);
    if (row.author_id === me.userId) return error('VALIDATION_ERROR', 'You can’t report your own post', 400);
    const rl = await checkRateLimit(env, `report:${me.userId}`, 20, 3600);
    if (!rl.allowed) return error('RATE_LIMITED', 'Too many reports. Try again later.', 429);
    const details = JSON.stringify({
      userId: row.author_id,
      source: 'consumer_report',
      kind: `product_${kind}`,
      item_id: row.id,
      product_id: row.product_id,
      excerpt: clip(row.body || '', 300),
    });
    await env.DB.prepare(
      `INSERT INTO reports (id, reporter_id, target_id, target_type, reason, status, workflow_status, priority, details, created_at, updated_at)
       VALUES (?, ?, ?, 'user', ?, 'pending', 'pending', 'normal', ?, datetime('now'), datetime('now'))`
    )
      .bind(generateId('report'), me.userId, row.author_id, v.data.reason, details)
      .run();
    return json({ ok: true });
  } catch (err) {
    console.error('[bizengage.reportItem]', err);
    return error('DATABASE_ERROR', 'Could not submit report', 500);
  }
}

// ---------------------------------------------------------------------------
// Inbox settings: saved replies + away message

type SavedReply = { id: string; title: string; body: string };
type InboxSettings = {
  saved_replies: SavedReply[];
  away: { enabled: boolean; message: string; schedule: AwaySchedule | null };
};

type InboxRow = {
  saved_replies: string;
  away_enabled: number;
  away_message: string;
  away_schedule: string | null;
};

function inboxOut(row: InboxRow | null): InboxSettings {
  return {
    saved_replies: parseJson<SavedReply[]>(row?.saved_replies, []),
    away: {
      enabled: !!row?.away_enabled,
      message: row?.away_message ?? '',
      schedule: parseJson<AwaySchedule | null>(row?.away_schedule, null),
    },
  };
}

async function loadInbox(env: Env, businessId: string): Promise<InboxRow | null> {
  return (
    (await env.DB.prepare(
      'SELECT saved_replies, away_enabled, away_message, away_schedule FROM business_inbox_settings WHERE business_id = ?'
    )
      .bind(businessId)
      .first<InboxRow>()) ?? null
  );
}

async function getInboxSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    return json(inboxOut(await loadInbox(env, auth.userId)));
  } catch (err) {
    console.error('[bizengage.getInboxSettings]', err);
    return error('DATABASE_ERROR', 'Failed to load inbox settings', 500);
  }
}

async function putInboxSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const v = await validateRequest(request, inboxSettingsSchema);
  if (!v.success) return v.response;
  if (v.data.away?.enabled && !v.data.away.message) {
    return error('VALIDATION_ERROR', 'Add an away message before turning it on', 400);
  }
  try {
    const current = inboxOut(await loadInbox(env, auth.userId));
    const next: InboxSettings = {
      saved_replies: v.data.saved_replies
        ? v.data.saved_replies.map((r) => ({ id: r.id || generateId('sr'), title: r.title, body: r.body }))
        : current.saved_replies,
      away: v.data.away
        ? {
            enabled: v.data.away.enabled,
            message: v.data.away.message,
            schedule:
              v.data.away.schedule === undefined
                ? current.away.schedule
                : v.data.away.schedule
                  ? { ...v.data.away.schedule, days: [...new Set(v.data.away.schedule.days)].sort() }
                  : null,
          }
        : current.away,
    };
    await env.DB.prepare(
      `INSERT INTO business_inbox_settings (business_id, saved_replies, away_enabled, away_message, away_schedule, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(business_id) DO UPDATE SET saved_replies = excluded.saved_replies,
         away_enabled = excluded.away_enabled, away_message = excluded.away_message,
         away_schedule = excluded.away_schedule, updated_at = excluded.updated_at`
    )
      .bind(
        auth.userId,
        JSON.stringify(next.saved_replies),
        next.away.enabled ? 1 : 0,
        next.away.message,
        next.away.schedule ? JSON.stringify(next.away.schedule) : null,
        new Date().toISOString()
      )
      .run();
    return json(next);
  } catch (err) {
    console.error('[bizengage.putInboxSettings]', err);
    return error('DATABASE_ERROR', 'Failed to save inbox settings', 500);
  }
}

// ---------------------------------------------------------------------------
// Away auto-reply

/** Local weekday (0 = Sunday) and minutes since midnight in a timezone. */
export function localClock(timeZone: string, at: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day: Math.max(0, day), minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Is `at` inside the away window? No schedule = always away. from == to = all day.
 * from > to spans midnight (the window belongs to the day it starts on).
 */
export function inAwayWindow(schedule: AwaySchedule | null, timeZone: string, at: Date): boolean {
  if (!schedule) return true;
  const days = new Set(schedule.days);
  if (!days.size) return false;
  const { day, minutes } = localClock(timeZone, at);
  const from = toMinutes(schedule.from);
  const to = toMinutes(schedule.to);
  if (from === to) return days.has(day);
  if (from < to) return days.has(day) && minutes >= from && minutes < to;
  const prev = (day + 6) % 7;
  return (days.has(day) && minutes >= from) || (days.has(prev) && minutes < to);
}

/**
 * After a customer's message to a business, send the business's away message once per
 * conversation per 12 h (when enabled and inside the schedule, in the business's timezone).
 * Stored as a normal message from the business with metadata {"auto":true}. Never throws.
 */
export async function maybeSendAwayReply(
  env: Env,
  conversationId: string,
  senderId: string,
  recipientId: string,
  now: Date = new Date()
): Promise<boolean> {
  try {
    if (!conversationId || !senderId || !recipientId || senderId === recipientId) return false;
    const users = await env.DB.prepare(
      'SELECT id, is_business, timezone FROM users WHERE id IN (?, ?)'
    )
      .bind(senderId, recipientId)
      .all<{ id: string; is_business: number; timezone: string | null }>();
    const sender = (users.results || []).find((u) => u.id === senderId);
    const biz = (users.results || []).find((u) => u.id === recipientId);
    if (!sender || !biz || sender.is_business || !biz.is_business) return false;

    const settings = await loadInbox(env, recipientId);
    if (!settings?.away_enabled || !settings.away_message.trim()) return false;
    const schedule = parseJson<AwaySchedule | null>(settings.away_schedule, null);
    if (!inAwayWindow(schedule, biz.timezone || 'UTC', now)) return false;
    if (await isBlocked(env, senderId, recipientId)) return false;

    const conv = await env.DB.prepare(
      'SELECT id FROM conversations WHERE id = ? AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))'
    )
      .bind(conversationId, senderId, recipientId, recipientId, senderId)
      .first();
    if (!conv) return false;

    // Claim the 12 h slot atomically (only one concurrent send wins).
    const nowIso = now.toISOString();
    const cutoff = new Date(now.getTime() - AWAY_COOLDOWN_MS).toISOString();
    const claim = await env.DB.prepare(
      `INSERT INTO business_away_log (conversation_id, business_id, last_sent_at) VALUES (?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET last_sent_at = excluded.last_sent_at
       WHERE business_away_log.last_sent_at <= ?`
    )
      .bind(conversationId, recipientId, nowIso, cutoff)
      .run();
    if (!claim.meta?.changes) return false;

    // One millisecond after the customer's message so it always sorts after it.
    const at = new Date(now.getTime() + 1).toISOString();
    await env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, body, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(generateId('msg'), conversationId, recipientId, settings.away_message.trim(), at, JSON.stringify({ auto: true }))
      .run();
    await env.DB.prepare('UPDATE conversations SET updated_at = ?, last_message_at = ? WHERE id = ?')
      .bind(at, at, conversationId)
      .run();
    return true;
  } catch (err) {
    console.error('[bizengage.maybeSendAwayReply]', err);
    return false;
  }
}
