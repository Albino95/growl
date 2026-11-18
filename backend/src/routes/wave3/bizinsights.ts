import { z } from 'zod';
import type { Env, Product } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext } from '../../utils/auth';
import { generateId } from '../../utils/id';
import { withIdempotency } from '../../utils/idempotency';
import { checkRateLimit, clientIp } from '../../utils/rateLimit';
import { generateInviteCode, normalizeInviteCode } from '../../utils/invites';
import { isKnownGrowthPath } from '../../utils/categories';
import { notArchivedSql } from '../business';

/**
 * Wave 6 — Business insights without orders (migration 0049).
 *
 *   POST   {api}/events                         → batched client events (auth optional) → { accepted }
 *   POST   {api}/products/:id/save              → { saved, saves }        (auth)
 *   DELETE {api}/products/:id/save              → { saved, saves }        (auth)
 *   GET    {api}/me/saved-products              → { products }            (auth)
 *   GET    {api}/business/insights?period=7d|30d|90d                       (business)
 *   GET    {api}/business/partner-links         → { links }               (business)
 *   POST   {api}/business/partner-links         → { link, links }         (business)
 *   DELETE {api}/business/partner-links/:id     → { ok }                  (business)
 *   GET    {api}/partner-links/:code            → { business_id, product_id, instructor_id } (public; counts a click)
 *   GET    {api}/p/:code                        → alias of the above
 *   GET    {api}/instructor/partner-links       → { links }               (instructor)
 *
 * Counting rules: views are deduped per viewer + item per 30 minutes and never count the
 * owner's own visits. Saves and partner clicks are counted server-side by the save and
 * resolve endpoints; the matching client events (product_save / product_unsave /
 * partner_click) are accepted for compatibility but not counted twice.
 */

export const VIEW_DEDUPE_MINUTES = 30;
export const ATTRIBUTION_DAYS = 7;
export const RAW_RETENTION_DAYS = 90;
export const AUDIENCE_MIN_VIEWERS = 20;
export const MAX_EVENTS_PER_BATCH = 50;
export const PARTNER_LINK_BASE = 'https://letsgrow.lu/p/';
/** Max distinct viewers whose paths are read for the audience breakdown. */
const AUDIENCE_SAMPLE = 1000;
/** IN-list chunk size (D1 caps bound params at 100 per statement). */
const IN_CHUNK = 90;
const PRUNE_BATCH = 1000;
const PRUNE_MAX_BATCHES = 10;

const EVENT_TYPES = [
  'product_view',
  'storefront_view',
  'link_tap',
  'product_save',
  'product_unsave',
  'partner_click',
] as const;
const SOURCES = ['feed', 'search', 'explore', 'storefront', 'shop', 'instructor', 'link', 'other'] as const;
type Source = (typeof SOURCES)[number];

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  product_id: z.string().min(1).max(80).optional().nullable(),
  business_id: z.string().min(1).max(80).optional().nullable(),
  partner_code: z.string().max(40).optional().nullable(),
  source: z.string().max(40).optional().nullable(),
  at: z.union([z.string().max(40), z.number()]).optional().nullable(),
});
const eventsBodySchema = z.object({
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});
const createLinkSchema = z
  .object({
    partnership_id: z.string().min(1).max(80).optional(),
    instructor_id: z.string().min(1).max(80).optional(),
    product_id: z.string().min(1).max(80).optional().nullable(),
  })
  .refine((b) => b.partnership_id || b.instructor_id, {
    message: 'partnership_id or instructor_id is required',
  });

export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  if (!path.startsWith(apiPrefix)) return null;
  const rest = path.slice(apiPrefix.length);
  const m = request.method;

  if (rest === '/events' && m === 'POST') return postEvents(request, env);
  if (rest === '/me/saved-products' && m === 'GET') return listSaved(request, env);
  if (rest === '/business/insights' && m === 'GET') return getInsights(request, env);
  if (rest === '/business/partner-links') {
    if (m === 'GET') return listBusinessLinks(request, env);
    if (m === 'POST') return withIdempotency(request, env, () => createLink(request, env));
  }
  if (rest === '/instructor/partner-links' && m === 'GET') return listInstructorLinks(request, env);

  const save = rest.match(/^\/products\/([^/]+)\/save$/);
  if (save) {
    const id = decodeURIComponent(save[1]);
    if (m === 'POST') return withIdempotency(request, env, () => setSaved(request, env, id, true));
    if (m === 'DELETE') return setSaved(request, env, id, false);
  }
  const del = rest.match(/^\/business\/partner-links\/([^/]+)$/);
  if (del && m === 'DELETE') return revokeLink(request, env, decodeURIComponent(del[1]));

  const resolve = rest.match(/^\/(?:partner-links|p)\/([^/]+)$/);
  if (resolve && m === 'GET') return resolveLink(request, env, decodeURIComponent(resolve[1]));

  return null;
}

// ---------------------------------------------------------------------------
// Helpers

type Me = { userId: string; isBusiness: boolean; isInstructor: boolean };

async function requireUser(request: Request, env: Env): Promise<Me | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return error('UNAUTHORIZED', 'Authentication required', 401);
  const u = ctx.user as { is_business?: number | boolean; is_instructor?: number | boolean } | undefined;
  return { userId: ctx.userId, isBusiness: Boolean(u?.is_business), isInstructor: Boolean(u?.is_instructor) };
}

async function requireBusiness(request: Request, env: Env): Promise<Me | Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  if (!me.isBusiness) return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  return me;
}

async function optionalUserId(request: Request, env: Env): Promise<string | null> {
  try {
    const ctx = await getRequestContext(request, env);
    return ctx.isAuthenticated && ctx.userId ? ctx.userId : null;
  } catch {
    return null;
  }
}

export function chunk<T>(list: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function sqlTime(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function normalizeSource(raw: unknown): Source {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (SOURCES as readonly string[]).includes(s) ? (s as Source) : 'other';
}

/** Short, non-reversible key for a signed-out viewer (dedupe only; rows live ≤ 1 h). */
async function anonViewerKey(request: Request): Promise<string> {
  const raw = `${clientIp(request)}|${request.headers.get('User-Agent') || ''}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  return `a:${hex}`;
}

/**
 * Returns the item keys (from `itemKeys`) that were NOT seen by this viewer in the last
 * 30 minutes, and marks them all as seen now. Chunked so no statement binds > 100 params.
 */
async function claimFreshViews(env: Env, viewerKey: string, itemKeys: string[], now: Date): Promise<Set<string>> {
  const unique = [...new Set(itemKeys)];
  if (!unique.length) return new Set();
  const cutoff = sqlTime(new Date(now.getTime() - VIEW_DEDUPE_MINUTES * 60_000));
  const seen = new Set<string>();
  for (const part of chunk(unique)) {
    const rows = await env.DB.prepare(
      `SELECT item_key FROM biz_view_dedupe
       WHERE viewer_key = ? AND last_at > ? AND item_key IN (${part.map(() => '?').join(',')})`
    )
      .bind(viewerKey, cutoff, ...part)
      .all<{ item_key: string }>();
    for (const r of rows.results || []) seen.add(r.item_key);
  }
  const fresh = unique.filter((k) => !seen.has(k));
  const at = sqlTime(now);
  // 3 params per row → 30 rows per statement.
  for (const part of chunk(fresh, 30)) {
    await env.DB.prepare(
      `INSERT INTO biz_view_dedupe (viewer_key, item_key, last_at) VALUES ${part.map(() => '(?, ?, ?)').join(',')}
       ON CONFLICT(viewer_key, item_key) DO UPDATE SET last_at = excluded.last_at`
    )
      .bind(...part.flatMap((k) => [viewerKey, k, at]))
      .run();
  }
  return new Set(fresh);
}

type RawEvent = {
  type: string;
  business_id: string;
  product_id: string | null;
  partner_link_id: string | null;
  viewer_id: string | null;
  source: string | null;
};

type Delta = {
  storefront_views?: number;
  product_views?: number;
  saves?: number;
  link_taps?: number;
  partner_clicks?: number;
};

/** Writes raw events + UPSERTs the daily aggregates. All statements ≤ 100 params. */
async function recordEvents(env: Env, events: RawEvent[], now: Date): Promise<void> {
  if (!events.length) return;
  const day = dayKey(now);
  const at = sqlTime(now);

  // Raw events: 8 params per row → 12 rows per statement.
  for (const part of chunk(events, 12)) {
    await env.DB.prepare(
      `INSERT INTO biz_events (type, business_id, product_id, partner_link_id, viewer_id, source, day, created_at)
       VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`
    )
      .bind(
        ...part.flatMap((e) => [e.type, e.business_id, e.product_id, e.partner_link_id, e.viewer_id, e.source, day, at])
      )
      .run();
  }

  // Per business.
  const biz = new Map<string, Required<Delta>>();
  const products = new Map<string, { business_id: string; views: number; saves: number }>();
  const sources = new Map<string, { business_id: string; source: string; views: number }>();
  for (const e of events) {
    const d = biz.get(e.business_id) ?? {
      storefront_views: 0,
      product_views: 0,
      saves: 0,
      link_taps: 0,
      partner_clicks: 0,
    };
    if (e.type === 'storefront_view') d.storefront_views++;
    if (e.type === 'product_view') d.product_views++;
    if (e.type === 'product_save') d.saves++;
    if (e.type === 'link_tap') d.link_taps++;
    if (e.type === 'partner_click') d.partner_clicks++;
    biz.set(e.business_id, d);

    if (e.product_id && (e.type === 'product_view' || e.type === 'product_save')) {
      const p = products.get(e.product_id) ?? { business_id: e.business_id, views: 0, saves: 0 };
      if (e.type === 'product_view') p.views++;
      else p.saves++;
      products.set(e.product_id, p);
    }
    if (e.type === 'product_view' || e.type === 'storefront_view') {
      const source = e.source || 'other';
      const key = `${e.business_id}|${source}`;
      const s = sources.get(key) ?? { business_id: e.business_id, source, views: 0 };
      s.views++;
      sources.set(key, s);
    }
  }

  // 7 params per row → 14 rows per statement.
  for (const part of chunk([...biz.entries()], 14)) {
    await env.DB.prepare(
      `INSERT INTO storefront_daily_stats
         (business_id, day, storefront_views, product_views, saves, link_taps, partner_clicks)
       VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',')}
       ON CONFLICT(business_id, day) DO UPDATE SET
         storefront_views = storefront_views + excluded.storefront_views,
         product_views = product_views + excluded.product_views,
         saves = saves + excluded.saves,
         link_taps = link_taps + excluded.link_taps,
         partner_clicks = partner_clicks + excluded.partner_clicks`
    )
      .bind(
        ...part.flatMap(([id, d]) => [id, day, d.storefront_views, d.product_views, d.saves, d.link_taps, d.partner_clicks])
      )
      .run();
  }
  // 5 params per row → 20 rows per statement.
  for (const part of chunk([...products.entries()], 20)) {
    await env.DB.prepare(
      `INSERT INTO product_daily_stats (product_id, day, business_id, views, saves)
       VALUES ${part.map(() => '(?, ?, ?, ?, ?)').join(',')}
       ON CONFLICT(product_id, day) DO UPDATE SET
         views = views + excluded.views, saves = saves + excluded.saves`
    )
      .bind(...part.flatMap(([id, p]) => [id, day, p.business_id, p.views, p.saves]))
      .run();
  }
  // 4 params per row → 25 rows per statement.
  for (const part of chunk([...sources.values()], 25)) {
    await env.DB.prepare(
      `INSERT INTO biz_source_daily_stats (business_id, day, source, views)
       VALUES ${part.map(() => '(?, ?, ?, ?)').join(',')}
       ON CONFLICT(business_id, day, source) DO UPDATE SET views = views + excluded.views`
    )
      .bind(...part.flatMap((s) => [s.business_id, day, s.source, s.views]))
      .run();
  }
}

// ---------------------------------------------------------------------------
// POST /events

async function postEvents(request: Request, env: Env): Promise<Response> {
  const viewerId = await optionalUserId(request, env);
  const ip = clientIp(request);
  const ipLimit = await checkRateLimit(env, `bizev:ip:${ip}`, 60, 60);
  if (!ipLimit.allowed) return error('RATE_LIMITED', 'Too many events. Try again shortly.', 429);
  if (viewerId) {
    const userLimit = await checkRateLimit(env, `bizev:u:${viewerId}`, 30, 60);
    if (!userLimit.allowed) return error('RATE_LIMITED', 'Too many events. Try again shortly.', 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }
  const parsed = eventsBodySchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', `events must be an array of 1–${MAX_EVENTS_PER_BATCH}`, 400);

  // Invalid individual events are dropped, not fatal (old clients, unknown types).
  const events = parsed.data.events
    .map((e) => eventSchema.safeParse(e))
    .filter((r): r is z.SafeParseSuccess<z.infer<typeof eventSchema>> => r.success)
    .map((r) => r.data);

  try {
    const now = new Date();
    // Resolve product → business (never trust the client's business_id for products).
    const productIds = [
      ...new Set(events.filter((e) => e.type === 'product_view' && e.product_id).map((e) => e.product_id!)),
    ];
    const productOwner = new Map<string, string>();
    for (const part of chunk(productIds)) {
      const rows = await env.DB.prepare(
        `SELECT id, user_id FROM products
         WHERE COALESCE(is_hidden, 0) = 0 AND id IN (${part.map(() => '?').join(',')})`
      )
        .bind(...part)
        .all<{ id: string; user_id: string }>();
      for (const r of rows.results || []) productOwner.set(r.id, r.user_id);
    }
    const businessIds = [
      ...new Set(
        events
          .filter((e) => (e.type === 'storefront_view' || e.type === 'link_tap') && e.business_id)
          .map((e) => e.business_id!)
      ),
    ];
    const businesses = new Set<string>();
    for (const part of chunk(businessIds)) {
      const rows = await env.DB.prepare(
        `SELECT id FROM users WHERE is_business = 1 AND id IN (${part.map(() => '?').join(',')})`
      )
        .bind(...part)
        .all<{ id: string }>();
      for (const r of rows.results || []) businesses.add(r.id);
    }

    const candidates: Array<RawEvent & { itemKey: string | null }> = [];
    for (const e of events) {
      const source = normalizeSource(e.source);
      if (e.type === 'product_view' && e.product_id) {
        const owner = productOwner.get(e.product_id);
        if (!owner || owner === viewerId) continue;
        candidates.push({
          type: e.type,
          business_id: owner,
          product_id: e.product_id,
          partner_link_id: null,
          viewer_id: viewerId,
          source,
          itemKey: `p:${e.product_id}`,
        });
      } else if (e.type === 'storefront_view' && e.business_id) {
        if (!businesses.has(e.business_id) || e.business_id === viewerId) continue;
        candidates.push({
          type: e.type,
          business_id: e.business_id,
          product_id: null,
          partner_link_id: null,
          viewer_id: viewerId,
          source,
          itemKey: `s:${e.business_id}`,
        });
      } else if (e.type === 'link_tap' && e.business_id) {
        if (!businesses.has(e.business_id) || e.business_id === viewerId) continue;
        candidates.push({
          type: e.type,
          business_id: e.business_id,
          product_id: null,
          partner_link_id: null,
          viewer_id: viewerId,
          source,
          itemKey: null,
        });
      }
      // product_save / product_unsave / partner_click: counted server-side elsewhere.
    }

    const viewerKey = viewerId ? `u:${viewerId}` : await anonViewerKey(request);
    const fresh = await claimFreshViews(
      env,
      viewerKey,
      candidates.filter((c) => c.itemKey).map((c) => c.itemKey!),
      now
    );
    const counted: RawEvent[] = [];
    const usedInBatch = new Set<string>();
    for (const c of candidates) {
      if (c.itemKey) {
        if (!fresh.has(c.itemKey) || usedInBatch.has(c.itemKey)) continue;
        usedInBatch.add(c.itemKey);
      }
      const { itemKey: _k, ...raw } = c;
      counted.push(raw);
    }
    await recordEvents(env, counted, now);
    return json({ accepted: events.length, counted: counted.length });
  } catch (err) {
    console.error('[bizinsights.postEvents] Error:', err);
    return error('DATABASE_ERROR', 'Failed to record events', 500);
  }
}

// ---------------------------------------------------------------------------
// Saves

async function countSaves(env: Env, productId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM product_saves WHERE product_id = ?')
    .bind(productId)
    .first<{ n: number }>();
  return Number(row?.n || 0);
}

/** Attributes a new save to the latest partner-link click by this user (same business, ≤ 7 days). */
async function attributeSave(env: Env, userId: string, productId: string, businessId: string, now: Date) {
  const since = sqlTime(new Date(now.getTime() - ATTRIBUTION_DAYS * 86_400_000));
  const click = await env.DB.prepare(
    `SELECT c.link_id FROM partner_link_clicks c
     JOIN partner_links l ON l.id = c.link_id
     WHERE c.user_id = ? AND c.business_id = ? AND c.created_at >= ?
       AND l.revoked_at IS NULL AND (l.product_id IS NULL OR l.product_id = ?)
     ORDER BY c.created_at DESC, c.id DESC LIMIT 1`
  )
    .bind(userId, businessId, since, productId)
    .first<{ link_id: string }>();
  if (!click) return;
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO partner_save_attributions (link_id, user_id, product_id, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(click.link_id, userId, productId, sqlTime(now))
    .run();
  if (Number(ins.meta?.changes || 0) > 0) {
    await env.DB.prepare('UPDATE partner_links SET saves_attributed = saves_attributed + 1 WHERE id = ?')
      .bind(click.link_id)
      .run();
  }
}

async function setSaved(request: Request, env: Env, productId: string, saved: boolean): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  try {
    if (!saved) {
      await env.DB.prepare('DELETE FROM product_saves WHERE user_id = ? AND product_id = ?')
        .bind(me.userId, productId)
        .run();
      return json({ saved: false, saves: await countSaves(env, productId) });
    }
    const limit = await checkRateLimit(env, `bizsave:${me.userId}`, 60, 60);
    if (!limit.allowed) return error('RATE_LIMITED', 'Too many saves. Try again shortly.', 429);
    const product = await env.DB.prepare(
      'SELECT id, user_id FROM products WHERE id = ? AND COALESCE(is_hidden, 0) = 0'
    )
      .bind(productId)
      .first<{ id: string; user_id: string }>();
    if (!product) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    const now = new Date();
    const ins = await env.DB.prepare(
      `INSERT OR IGNORE INTO product_saves (user_id, product_id, business_id, created_at) VALUES (?, ?, ?, ?)`
    )
      .bind(me.userId, productId, product.user_id, sqlTime(now))
      .run();
    const isNew = Number(ins.meta?.changes || 0) > 0;
    if (isNew && product.user_id !== me.userId) {
      await recordEvents(
        env,
        [
          {
            type: 'product_save',
            business_id: product.user_id,
            product_id: productId,
            partner_link_id: null,
            viewer_id: me.userId,
            source: null,
          },
        ],
        now
      );
      await attributeSave(env, me.userId, productId, product.user_id, now);
    }
    return json({ saved: true, saves: await countSaves(env, productId) });
  } catch (err) {
    console.error('[bizinsights.setSaved] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update saved products', 500);
  }
}

async function listSaved(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  try {
    const rows = await env.DB.prepare(
      `SELECT p.*, u.metadata AS user_metadata, s.created_at AS saved_at
       FROM product_saves s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = p.user_id
       WHERE s.user_id = ? AND COALESCE(p.is_hidden, 0) = 0
       ORDER BY s.created_at DESC
       LIMIT 200`
    )
      .bind(me.userId)
      .all<Product & { user_metadata: string; saved_at: string }>();
    const products = (rows.results || []).map(({ user_metadata, ...p }) => {
      const meta = parseJson<{ username?: string; avatar?: string }>(user_metadata, {});
      return {
        ...p,
        images: parseJson(p.images as unknown as string, []),
        metadata: parseJson(p.metadata as unknown as string, {}),
        business: { id: p.user_id, username: meta.username, avatar: meta.avatar },
        saved: true,
      };
    });
    return json({ products });
  } catch (err) {
    console.error('[bizinsights.listSaved] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load saved products', 500);
  }
}

// ---------------------------------------------------------------------------
// GET /business/insights

const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** Pure: the day keys of the current period (oldest first) and the previous period's range. */
export function periodDays(period: string, now: Date) {
  const n = PERIOD_DAYS[period] ?? 7;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayKey(new Date(today - i * 86_400_000)));
  const prevEnd = dayKey(new Date(today - n * 86_400_000));
  const prevStart = dayKey(new Date(today - (2 * n - 1) * 86_400_000));
  return { n, days, start: days[0], end: days[days.length - 1], prevStart, prevEnd };
}

/** Pure: top-level path shares from viewers' path lists. */
export function topPaths(viewerPaths: string[][], limit = 5): Array<{ path: string; share: number }> {
  const counts = new Map<string, number>();
  let withPaths = 0;
  for (const list of viewerPaths) {
    const tops = new Set(
      list
        .filter((p) => isKnownGrowthPath(p))
        .map((p) => p.trim().toLowerCase().split(':')[0])
    );
    if (!tops.size) continue;
    withPaths++;
    for (const t of tops) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (!withPaths) return [];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([path, n]) => ({ path, share: Number((n / withPaths).toFixed(2)) }));
}

type Totals = { storefront_views: number; product_views: number; saves: number; link_taps: number; partner_clicks: number };

async function sumTotals(env: Env, businessId: string, from: string, to: string): Promise<Totals> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(storefront_views), 0) AS storefront_views,
            COALESCE(SUM(product_views), 0) AS product_views,
            COALESCE(SUM(saves), 0) AS saves,
            COALESCE(SUM(link_taps), 0) AS link_taps,
            COALESCE(SUM(partner_clicks), 0) AS partner_clicks
     FROM storefront_daily_stats WHERE business_id = ? AND day >= ? AND day <= ?`
  )
    .bind(businessId, from, to)
    .first<Totals>();
  return {
    storefront_views: Number(row?.storefront_views || 0),
    product_views: Number(row?.product_views || 0),
    saves: Number(row?.saves || 0),
    link_taps: Number(row?.link_taps || 0),
    partner_clicks: Number(row?.partner_clicks || 0),
  };
}

async function getInsights(request: Request, env: Env): Promise<Response> {
  const me = await requireBusiness(request, env);
  if (me instanceof Response) return me;
  const url = new URL(request.url);
  const raw = url.searchParams.get('period') || '7d';
  const period = PERIOD_DAYS[raw] ? raw : '7d';
  const p = periodDays(period, new Date());
  try {
    const [totals, previous, dailyRows, topRows, sourceRows, viewerCount] = await Promise.all([
      sumTotals(env, me.userId, p.start, p.end),
      sumTotals(env, me.userId, p.prevStart, p.prevEnd),
      env.DB.prepare(
        `SELECT day, storefront_views, product_views, saves FROM storefront_daily_stats
         WHERE business_id = ? AND day >= ? AND day <= ?`
      )
        .bind(me.userId, p.start, p.end)
        .all<{ day: string; storefront_views: number; product_views: number; saves: number }>(),
      env.DB.prepare(
        `SELECT s.product_id AS id, p.name, p.image_url, SUM(s.views) AS views, SUM(s.saves) AS saves
         FROM product_daily_stats s
         JOIN products p ON p.id = s.product_id
         WHERE s.business_id = ? AND s.day >= ? AND s.day <= ? AND ${notArchivedSql('p')}
         GROUP BY s.product_id
         ORDER BY views DESC, saves DESC
         LIMIT 5`
      )
        .bind(me.userId, p.start, p.end)
        .all<{ id: string; name: string; image_url: string | null; views: number; saves: number }>(),
      env.DB.prepare(
        `SELECT source, SUM(views) AS views FROM biz_source_daily_stats
         WHERE business_id = ? AND day >= ? AND day <= ?
         GROUP BY source ORDER BY views DESC`
      )
        .bind(me.userId, p.start, p.end)
        .all<{ source: string; views: number }>(),
      env.DB.prepare(
        `SELECT COUNT(DISTINCT viewer_id) AS n FROM biz_events
         WHERE business_id = ? AND day >= ? AND day <= ? AND viewer_id IS NOT NULL
           AND type IN ('product_view', 'storefront_view')`
      )
        .bind(me.userId, p.start, p.end)
        .first<{ n: number }>(),
    ]);

    const byDay = new Map((dailyRows.results || []).map((r) => [r.day, r]));
    const daily = p.days.map((day) => {
      const r = byDay.get(day);
      return {
        day,
        storefront_views: Number(r?.storefront_views || 0),
        product_views: Number(r?.product_views || 0),
        saves: Number(r?.saves || 0),
      };
    });

    let audience: { top_paths: Array<{ path: string; share: number }> } | null = null;
    if (Number(viewerCount?.n || 0) >= AUDIENCE_MIN_VIEWERS) {
      const viewers = await env.DB.prepare(
        `SELECT DISTINCT viewer_id FROM biz_events
         WHERE business_id = ? AND day >= ? AND day <= ? AND viewer_id IS NOT NULL
           AND type IN ('product_view', 'storefront_view')
         LIMIT ${AUDIENCE_SAMPLE}`
      )
        .bind(me.userId, p.start, p.end)
        .all<{ viewer_id: string }>();
      const ids = (viewers.results || []).map((r) => r.viewer_id);
      const lists: string[][] = [];
      for (const part of chunk(ids)) {
        const rows = await env.DB.prepare(
          `SELECT metadata FROM users WHERE id IN (${part.map(() => '?').join(',')})`
        )
          .bind(...part)
          .all<{ metadata: string | null }>();
        for (const r of rows.results || []) {
          const meta = parseJson<{ categories?: unknown }>(r.metadata, {});
          lists.push(Array.isArray(meta.categories) ? meta.categories.filter((c): c is string => typeof c === 'string') : []);
        }
      }
      audience = { top_paths: topPaths(lists) };
    }

    return json({
      period,
      totals,
      previous,
      daily,
      top_products: (topRows.results || []).map((r) => ({
        id: r.id,
        name: r.name,
        image_url: r.image_url,
        views: Number(r.views || 0),
        saves: Number(r.saves || 0),
      })),
      sources: (sourceRows.results || []).map((r) => ({ source: r.source, views: Number(r.views || 0) })),
      audience,
    });
  } catch (err) {
    console.error('[bizinsights.getInsights] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load insights', 500);
  }
}

// ---------------------------------------------------------------------------
// Partner tracked links

type LinkRow = {
  id: string;
  business_id: string;
  instructor_id: string;
  partnership_id: string | null;
  product_id: string | null;
  code: string;
  clicks: number;
  saves_attributed: number;
  created_at: string;
  other_metadata: string | null;
  other_business_name?: string | null;
  product_name?: string | null;
};

function personName(metadata: string | null | undefined, fallback: string): string {
  const meta = parseJson<{ display_name?: string; name?: string; username?: string }>(metadata, {});
  return meta.display_name || meta.name || meta.username || fallback;
}

function serializeLink(r: LinkRow, side: 'business' | 'instructor') {
  const base = {
    id: r.id,
    partnership_id: r.partnership_id,
    product_id: r.product_id,
    product_name: r.product_name ?? null,
    code: r.code,
    url: `${PARTNER_LINK_BASE}${r.code}`,
    clicks: Number(r.clicks || 0),
    saves_attributed: Number(r.saves_attributed || 0),
    created_at: r.created_at,
  };
  if (side === 'business') {
    return { ...base, instructor: { id: r.instructor_id, name: personName(r.other_metadata, 'Instructor') } };
  }
  return {
    ...base,
    business: {
      id: r.business_id,
      name: r.other_business_name || personName(r.other_metadata, 'Business'),
    },
  };
}

async function loadBusinessLinks(env: Env, businessId: string) {
  const rows = await env.DB.prepare(
    `SELECT l.*, u.metadata AS other_metadata, p.name AS product_name
     FROM partner_links l
     JOIN users u ON u.id = l.instructor_id
     LEFT JOIN products p ON p.id = l.product_id
     WHERE l.business_id = ? AND l.revoked_at IS NULL
     ORDER BY l.created_at DESC
     LIMIT 200`
  )
    .bind(businessId)
    .all<LinkRow>();
  return (rows.results || []).map((r) => serializeLink(r, 'business'));
}

async function listBusinessLinks(request: Request, env: Env): Promise<Response> {
  const me = await requireBusiness(request, env);
  if (me instanceof Response) return me;
  try {
    return json({ links: await loadBusinessLinks(env, me.userId) });
  } catch (err) {
    console.error('[bizinsights.listBusinessLinks] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load partner links', 500);
  }
}

async function createLink(request: Request, env: Env): Promise<Response> {
  const me = await requireBusiness(request, env);
  if (me instanceof Response) return me;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }
  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid body', 400);
  const input = parsed.data;
  try {
    const partnership = await env.DB.prepare(
      `SELECT id, instructor_id FROM partnerships
       WHERE business_id = ? AND status = 'active' AND ${input.partnership_id ? 'id = ?' : 'instructor_id = ?'}`
    )
      .bind(me.userId, input.partnership_id || input.instructor_id)
      .first<{ id: string; instructor_id: string }>();
    if (!partnership) {
      return error('PARTNERSHIP_NOT_FOUND', 'You can create links only for active partners.', 404);
    }
    const productId = input.product_id || null;
    if (productId) {
      const own = await env.DB.prepare(
        `SELECT id FROM products WHERE id = ? AND user_id = ? AND COALESCE(is_hidden, 0) = 0`
      )
        .bind(productId, me.userId)
        .first<{ id: string }>();
      if (!own) return error('PRODUCT_NOT_FOUND', 'Product not found', 404);
    }
    const existing = await env.DB.prepare(
      `SELECT id FROM partner_links
       WHERE business_id = ? AND instructor_id = ? AND revoked_at IS NULL
         AND COALESCE(product_id, '') = ?`
    )
      .bind(me.userId, partnership.instructor_id, productId || '')
      .first<{ id: string }>();

    let linkId = existing?.id;
    if (!linkId) {
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM partner_links WHERE business_id = ? AND revoked_at IS NULL'
      )
        .bind(me.userId)
        .first<{ n: number }>();
      if (Number(count?.n || 0) >= 200) {
        return error('LIMIT_REACHED', 'You have reached the partner link limit. Remove an old link first.', 409);
      }
      linkId = generateId('plink');
      let created = false;
      for (let attempt = 0; attempt < 6 && !created; attempt++) {
        try {
          await env.DB.prepare(
            `INSERT INTO partner_links (id, business_id, instructor_id, partnership_id, product_id, code, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(linkId, me.userId, partnership.instructor_id, partnership.id, productId, generateInviteCode(), sqlTime(new Date()))
            .run();
          created = true;
        } catch (err) {
          if (/UNIQUE|constraint/i.test(String((err as Error)?.message ?? err))) continue;
          throw err;
        }
      }
      if (!created) return error('DATABASE_ERROR', 'Could not create a link code', 500);
    }
    const links = await loadBusinessLinks(env, me.userId);
    const link = links.find((l) => l.id === linkId) ?? null;
    return json({ link, links }, existing ? 200 : 201);
  } catch (err) {
    console.error('[bizinsights.createLink] Error:', err);
    return error('DATABASE_ERROR', 'Failed to create partner link', 500);
  }
}

async function revokeLink(request: Request, env: Env, id: string): Promise<Response> {
  const me = await requireBusiness(request, env);
  if (me instanceof Response) return me;
  try {
    const res = await env.DB.prepare(
      `UPDATE partner_links SET revoked_at = ? WHERE id = ? AND business_id = ? AND revoked_at IS NULL`
    )
      .bind(sqlTime(new Date()), id, me.userId)
      .run();
    if (!Number(res.meta?.changes || 0)) return error('NOT_FOUND', 'Link not found', 404);
    return json({ ok: true });
  } catch (err) {
    console.error('[bizinsights.revokeLink] Error:', err);
    return error('DATABASE_ERROR', 'Failed to remove partner link', 500);
  }
}

async function listInstructorLinks(request: Request, env: Env): Promise<Response> {
  const me = await requireUser(request, env);
  if (me instanceof Response) return me;
  try {
    const rows = await env.DB.prepare(
      `SELECT l.*, u.metadata AS other_metadata, bs.business_name AS other_business_name, p.name AS product_name
       FROM partner_links l
       JOIN users u ON u.id = l.business_id
       LEFT JOIN business_settings bs ON bs.business_id = l.business_id
       LEFT JOIN products p ON p.id = l.product_id
       WHERE l.instructor_id = ? AND l.revoked_at IS NULL
       ORDER BY l.created_at DESC
       LIMIT 200`
    )
      .bind(me.userId)
      .all<LinkRow>();
    return json({ links: (rows.results || []).map((r) => serializeLink(r, 'instructor')) });
  } catch (err) {
    console.error('[bizinsights.listInstructorLinks] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load partner links', 500);
  }
}

async function resolveLink(request: Request, env: Env, rawCode: string): Promise<Response> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return error('NOT_FOUND', 'Link not found', 404);
  const limit = await checkRateLimit(env, `bizlink:ip:${clientIp(request)}`, 60, 60);
  if (!limit.allowed) return error('RATE_LIMITED', 'Too many requests. Try again shortly.', 429);
  try {
    const link = await env.DB.prepare(
      `SELECT id, business_id, instructor_id, product_id FROM partner_links WHERE code = ? AND revoked_at IS NULL`
    )
      .bind(code)
      .first<{ id: string; business_id: string; instructor_id: string; product_id: string | null }>();
    if (!link) return error('NOT_FOUND', 'Link not found', 404);

    const viewerId = await optionalUserId(request, env);
    const isParty = viewerId === link.business_id || viewerId === link.instructor_id;
    if (!isParty) {
      const now = new Date();
      const viewerKey = viewerId ? `u:${viewerId}` : await anonViewerKey(request);
      const fresh = await claimFreshViews(env, viewerKey, [`l:${link.id}`], now);
      if (fresh.size) {
        await env.DB.prepare('UPDATE partner_links SET clicks = clicks + 1 WHERE id = ?').bind(link.id).run();
        await recordEvents(
          env,
          [
            {
              type: 'partner_click',
              business_id: link.business_id,
              product_id: link.product_id,
              partner_link_id: link.id,
              viewer_id: viewerId,
              source: 'link',
            },
          ],
          now
        );
      }
      // Every signed-in click (deduped or not) refreshes the attribution window.
      if (viewerId) {
        await env.DB.prepare(
          `INSERT INTO partner_link_clicks (link_id, business_id, user_id, created_at) VALUES (?, ?, ?, ?)`
        )
          .bind(link.id, link.business_id, viewerId, sqlTime(now))
          .run();
      }
    }
    return json({ business_id: link.business_id, product_id: link.product_id, instructor_id: link.instructor_id });
  } catch (err) {
    console.error('[bizinsights.resolveLink] Error:', err);
    return error('DATABASE_ERROR', 'Failed to open link', 500);
  }
}

// ---------------------------------------------------------------------------
// Cron: prune raw events (aggregates are kept) and stale dedupe rows.

async function pruneBatched(env: Env, table: string, cutoff: string): Promise<number> {
  let total = 0;
  for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
    const res = await env.DB.prepare(
      `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE created_at < ? LIMIT ${PRUNE_BATCH})`
    )
      .bind(cutoff)
      .run();
    const n = Number(res.meta?.changes || 0);
    total += n;
    if (n < PRUNE_BATCH) break;
  }
  return total;
}

export async function runCron(env: Env, now: Date): Promise<void> {
  const rawCutoff = sqlTime(new Date(now.getTime() - RAW_RETENTION_DAYS * 86_400_000));
  await pruneBatched(env, 'biz_events', rawCutoff);
  await pruneBatched(env, 'partner_link_clicks', rawCutoff);
  // Dedupe rows only matter for 30 minutes; keep an hour.
  await env.DB.prepare('DELETE FROM biz_view_dedupe WHERE last_at < ?')
    .bind(sqlTime(new Date(now.getTime() - 60 * 60_000)))
    .run();
}
