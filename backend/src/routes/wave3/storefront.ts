import { z } from 'zod';
import type { Env } from '../../types';
import { json, error } from '../../utils/response';
import { getRequestContext, restrictionFromState } from '../../utils/auth';
import { withIdempotency } from '../../utils/idempotency';
import { isKnownGrowthPath } from '../../utils/categories';
import { requireAdmin, writeAdminAudit, requestIp } from '../../utils/adminAuth';
import { isBlocked } from '../friends';
import { messagingAccess, chunk } from '../messages';
import { notArchivedSql, createBusinessNotification } from '../business';

/**
 * Wave 6 storefront module (migration 0048). Paths:
 *
 *   GET  {api}/business/storefront                    → { storefront }            (owner)
 *   PUT  {api}/business/storefront                    → { storefront }            (owner, partial)
 *   GET  {api}/business/verification                  → { status, reason?, … }    (owner)
 *   POST {api}/business/verification                  → { status:'pending' }      (owner)
 *   GET  {api}/storefronts/verified?ids=a,b           → { verified:[ids] }        (public, ≤50 ids)
 *   GET  {api}/storefronts/:businessUserId            → public storefront          (auth optional)
 *   GET  {api}/storefronts/:businessUserId/products   → paged active products     (auth optional)
 *   GET  {api}/admin/business/verifications           → review queue              (admin business.write)
 *   POST {api}/admin/business/verifications/:userId   → approve / reject          (admin business.write, audited)
 */
export async function handle(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  const m = request.method;

  if (path === `${apiPrefix}/business/storefront`) {
    if (m === 'GET') return getOwnStorefront(request, env);
    if (m === 'PUT') return putOwnStorefront(request, env);
    return null;
  }
  if (path === `${apiPrefix}/business/verification`) {
    if (m === 'GET') return getOwnVerification(request, env);
    if (m === 'POST') return withIdempotency(request, env, () => requestVerification(request, env));
    return null;
  }

  if (path.startsWith(`${apiPrefix}/storefronts/`) && m === 'GET') {
    const rest = path.slice(`${apiPrefix}/storefronts/`.length);
    if (rest === 'verified') return getVerifiedBatch(request, env);
    const products = rest.match(/^([^/]+)\/products$/);
    if (products) return getPublicProducts(request, env, decodeURIComponent(products[1]));
    if (/^[^/]+$/.test(rest)) return getPublicStorefront(request, env, decodeURIComponent(rest));
    return null;
  }

  if (path === `${apiPrefix}/admin/business/verifications` && m === 'GET') {
    return listVerifications(request, env);
  }
  const decide = path.match(new RegExp(`^${apiPrefix}/admin/business/verifications/([^/]+)$`));
  if (decide && m === 'POST') return decideVerification(request, env, decodeURIComponent(decide[1]));

  return null;
}

/** No scheduled work for storefronts. */
export async function runCron(_env: Env, _now: Date): Promise<void> {}

// ---------------------------------------------------------------------------
// Limits + validation

export const STOREFRONT_LIMITS = {
  tagline: 80,
  about: 1200,
  links: 4,
  linkLabel: 40,
  linkUrl: 500,
  pathTags: 3,
  featured: 6,
  locationLabel: 80,
  pickupNote: 200,
  hours: 14,
  shipping: 600,
  returns: 600,
  pickup: 400,
} as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** https:// with a host — links open in the buyer's browser, so nothing else is allowed. */
export function isHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Cover images come from our media upload (https in prod, http on a local worker). */
function isImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
  } catch {
    return false;
  }
}

const optText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const storefrontPatchSchema = z.object({
  cover_url: z
    .union([z.string().trim().max(1000).refine((v) => v === '' || isImageUrl(v), 'Cover must be an image URL'), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v : null)),
  tagline: optText(STOREFRONT_LIMITS.tagline),
  about: optText(STOREFRONT_LIMITS.about),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(STOREFRONT_LIMITS.linkLabel),
        url: z
          .string()
          .trim()
          .max(STOREFRONT_LIMITS.linkUrl)
          .refine(isHttpsUrl, 'Links must start with https://'),
      })
    )
    .max(STOREFRONT_LIMITS.links)
    .optional(),
  path_tags: z
    .array(z.string().trim().toLowerCase().refine(isKnownGrowthPath, 'Unknown path'))
    .max(STOREFRONT_LIMITS.pathTags)
    .optional()
    .transform((v) => (v ? Array.from(new Set(v)) : v)),
  featured_product_ids: z
    .array(z.string().trim().min(1).max(100))
    .max(STOREFRONT_LIMITS.featured)
    .optional()
    .transform((v) => (v ? Array.from(new Set(v)) : v)),
  pinned_post_id: z.union([z.string().trim().min(1).max(100), z.null()]).optional(),
  location_label: optText(STOREFRONT_LIMITS.locationLabel),
  pickup_note: optText(STOREFRONT_LIMITS.pickupNote),
  hours: z
    .array(
      z
        .object({
          day: z.number().int().min(0).max(6),
          open: z.string().regex(HHMM, 'Use HH:MM'),
          close: z.string().regex(HHMM, 'Use HH:MM'),
        })
        .refine((h) => h.open < h.close, 'Closing time must be after opening time')
    )
    .max(STOREFRONT_LIMITS.hours)
    .optional(),
  policies: z
    .object({
      shipping: optText(STOREFRONT_LIMITS.shipping),
      returns: optText(STOREFRONT_LIMITS.returns),
      pickup: optText(STOREFRONT_LIMITS.pickup),
    })
    .optional(),
});

export type StorefrontPatch = z.infer<typeof storefrontPatchSchema>;

const verificationRequestSchema = z.object({
  website: z
    .union([z.string().trim().max(300).refine((v) => v === '' || isHttpsUrl(v), 'Website must start with https://'), z.null()])
    .optional(),
  registration_number: z.union([z.string().trim().max(64), z.null()]).optional(),
  note: z.union([z.string().trim().max(600), z.null()]).optional(),
});

const verificationDecisionSchema = z.object({
  approve: z.boolean(),
  reason: z.union([z.string().trim().max(300), z.null()]).optional(),
});

// ---------------------------------------------------------------------------
// Shapes

export type StorefrontLink = { label: string; url: string };
export type StorefrontHours = { day: number; open: string; close: string };
export type StorefrontPolicies = { shipping: string | null; returns: string | null; pickup: string | null };

export type Storefront = {
  business_id: string;
  cover_url: string | null;
  tagline: string | null;
  about: string | null;
  links: StorefrontLink[];
  path_tags: string[];
  featured_product_ids: string[];
  pinned_post_id: string | null;
  location_label: string | null;
  pickup_note: string | null;
  hours: StorefrontHours[];
  policies: StorefrontPolicies;
  updated_at: string | null;
};

type StorefrontRow = {
  business_id: string;
  cover_url: string | null;
  tagline: string | null;
  about: string | null;
  links: string | null;
  path_tags: string | null;
  featured_product_ids: string | null;
  pinned_post_id: string | null;
  location_label: string | null;
  pickup_note: string | null;
  hours: string | null;
  policies: string | null;
  updated_at: string | null;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    const v = raw ? JSON.parse(raw) : fallback;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function sortHours(hours: StorefrontHours[]): StorefrontHours[] {
  return [...hours].sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
}

export function emptyStorefront(businessId: string): Storefront {
  return {
    business_id: businessId,
    cover_url: null,
    tagline: null,
    about: null,
    links: [],
    path_tags: [],
    featured_product_ids: [],
    pinned_post_id: null,
    location_label: null,
    pickup_note: null,
    hours: [],
    policies: { shipping: null, returns: null, pickup: null },
    updated_at: null,
  };
}

function rowToStorefront(businessId: string, row: StorefrontRow | null): Storefront {
  if (!row) return emptyStorefront(businessId);
  const arr = <T>(raw: string | null): T[] => {
    const v = parseJson<unknown>(raw, []);
    return Array.isArray(v) ? (v as T[]) : [];
  };
  const pol = parseJson<Partial<StorefrontPolicies>>(row.policies, {});
  return {
    business_id: businessId,
    cover_url: row.cover_url || null,
    tagline: row.tagline || null,
    about: row.about || null,
    links: arr<StorefrontLink>(row.links).filter((l) => l && typeof l.url === 'string' && isHttpsUrl(l.url)),
    path_tags: arr<string>(row.path_tags).filter((t) => typeof t === 'string'),
    featured_product_ids: arr<string>(row.featured_product_ids).filter((t) => typeof t === 'string'),
    pinned_post_id: row.pinned_post_id || null,
    location_label: row.location_label || null,
    pickup_note: row.pickup_note || null,
    hours: sortHours(arr<StorefrontHours>(row.hours)),
    policies: {
      shipping: pol.shipping || null,
      returns: pol.returns || null,
      pickup: pol.pickup || null,
    },
    updated_at: row.updated_at || null,
  };
}

async function loadStorefront(env: Env, businessId: string): Promise<Storefront> {
  const row = await env.DB.prepare('SELECT * FROM business_storefronts WHERE business_id = ?')
    .bind(businessId)
    .first<StorefrontRow>();
  return rowToStorefront(businessId, row);
}

/** Apply a validated patch on top of the current storefront (pure). */
export function mergeStorefront(current: Storefront, patch: StorefrontPatch): Storefront {
  const next: Storefront = { ...current, policies: { ...current.policies } };
  if (patch.cover_url !== undefined) next.cover_url = patch.cover_url;
  if (patch.tagline !== undefined) next.tagline = patch.tagline;
  if (patch.about !== undefined) next.about = patch.about;
  if (patch.links !== undefined) next.links = patch.links;
  if (patch.path_tags !== undefined) next.path_tags = patch.path_tags;
  if (patch.featured_product_ids !== undefined) next.featured_product_ids = patch.featured_product_ids;
  if (patch.pinned_post_id !== undefined) next.pinned_post_id = patch.pinned_post_id;
  if (patch.location_label !== undefined) next.location_label = patch.location_label;
  if (patch.pickup_note !== undefined) next.pickup_note = patch.pickup_note;
  if (patch.hours !== undefined) next.hours = sortHours(patch.hours);
  if (patch.policies) {
    for (const k of ['shipping', 'returns', 'pickup'] as const) {
      if (patch.policies[k] !== undefined) next.policies[k] = patch.policies[k] ?? null;
    }
  }
  return next;
}

/** Visible in the shop: not hidden by moderation and not archived by the seller. */
function activeProductSql(alias = 'p'): string {
  return `COALESCE(${alias}.is_hidden, 0) = 0 AND ${notArchivedSql(alias)}`;
}

type ProductRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  images: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

type BusinessCard = { id: string; username: string; avatar: string | null; verified: boolean };

/** Product card in the marketplace list shape, plus the seller's verified flag. */
function productCard(p: ProductRow, business: BusinessCard) {
  return {
    id: p.id,
    user_id: p.user_id,
    name: p.name,
    description: p.description,
    category: p.category,
    subcategory: p.subcategory,
    price: Number(p.price) || 0,
    stock: Number(p.stock) || 0,
    sold_out: Number(p.stock) <= 0,
    image_url: p.image_url,
    images: parseJson<unknown[]>(p.images, []),
    metadata: parseJson<Record<string, unknown>>(p.metadata, {}),
    created_at: p.created_at,
    updated_at: p.updated_at,
    business,
  };
}

// ---------------------------------------------------------------------------
// Verification state

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

type VerificationFacts = {
  profileStatus: string | null; // business_profiles.verification_status (admin-provisioned)
  requestStatus: string | null; // business_verification_requests.status
};

/**
 * When an admin-provisioned profile exists its status is the source of truth (the old
 * admin "verify" button writes it); otherwise the verification request decides.
 */
export function isVerified(f: VerificationFacts): boolean {
  if (f.profileStatus) return f.profileStatus === 'verified';
  return f.requestStatus === 'verified';
}

export function verificationStatusOf(f: VerificationFacts): VerificationStatus {
  if (isVerified(f)) return 'verified';
  if (f.requestStatus) {
    if (f.requestStatus === 'verified' || f.requestStatus === 'pending') {
      return f.profileStatus === 'rejected' ? 'rejected' : 'pending';
    }
    return 'rejected';
  }
  return f.profileStatus === 'rejected' ? 'rejected' : 'none';
}

/** Verified flags for many business ids (chunked IN lists). */
export async function loadVerifiedSet(env: Env, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (const part of chunk(unique)) {
    const marks = part.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT u.id, bp.verification_status AS profile_status, vr.status AS request_status
       FROM users u
       LEFT JOIN business_profiles bp ON bp.user_id = u.id
       LEFT JOIN business_verification_requests vr ON vr.business_id = u.id
       WHERE u.id IN (${marks}) AND u.is_business = 1`
    )
      .bind(...part)
      .all<{ id: string; profile_status: string | null; request_status: string | null }>();
    for (const r of rows.results || []) {
      if (isVerified({ profileStatus: r.profile_status, requestStatus: r.request_status })) out.add(r.id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auth helpers

type BizCtx = { userId: string };

async function requireBusiness(request: Request, env: Env): Promise<BizCtx | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) return error('UNAUTHORIZED', 'Authentication required', 401);
  if (!ctx.user?.is_business) return error('FORBIDDEN', 'Only businesses can access this endpoint', 403);
  return { userId: ctx.userId };
}

async function readBody(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }
}

function zodFail(err: z.ZodError): Response {
  const first = err.errors[0];
  const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
  return error('VALIDATION_ERROR', `${where}${first?.message || 'Invalid request data'}`, 400, err.errors);
}

// ---------------------------------------------------------------------------
// Owner: storefront

async function getOwnStorefront(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    return json({ storefront: await loadStorefront(env, auth.userId) });
  } catch (err) {
    console.error('[storefront.get] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load your storefront', 500);
  }
}

async function putOwnStorefront(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const parsed = storefrontPatchSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const patch = parsed.data;

  try {
    if (patch.featured_product_ids && patch.featured_product_ids.length) {
      const ids = patch.featured_product_ids;
      const marks = ids.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT p.id FROM products p WHERE p.user_id = ? AND p.id IN (${marks}) AND ${activeProductSql('p')}`
      )
        .bind(auth.userId, ...ids)
        .all<{ id: string }>();
      const ok = new Set((rows.results || []).map((r) => r.id));
      const bad = ids.filter((id) => !ok.has(id));
      if (bad.length) {
        return error(
          'INVALID_FEATURED_PRODUCT',
          'Featured products must be your own products that are visible in the shop.',
          400,
          { product_ids: bad }
        );
      }
    }
    if (patch.pinned_post_id) {
      const post = await env.DB.prepare(
        `SELECT id FROM posts WHERE id = ? AND user_id = ? AND COALESCE(is_hidden, 0) = 0`
      )
        .bind(patch.pinned_post_id, auth.userId)
        .first<{ id: string }>();
      if (!post) return error('INVALID_PINNED_POST', 'You can only pin one of your own posts.', 400);
    }

    const next = mergeStorefront(await loadStorefront(env, auth.userId), patch);
    await env.DB.prepare(
      `INSERT INTO business_storefronts
        (business_id, cover_url, tagline, about, links, path_tags, featured_product_ids, pinned_post_id,
         location_label, pickup_note, hours, policies, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         cover_url = excluded.cover_url,
         tagline = excluded.tagline,
         about = excluded.about,
         links = excluded.links,
         path_tags = excluded.path_tags,
         featured_product_ids = excluded.featured_product_ids,
         pinned_post_id = excluded.pinned_post_id,
         location_label = excluded.location_label,
         pickup_note = excluded.pickup_note,
         hours = excluded.hours,
         policies = excluded.policies,
         updated_at = datetime('now')`
    )
      .bind(
        auth.userId,
        next.cover_url,
        next.tagline,
        next.about,
        JSON.stringify(next.links),
        JSON.stringify(next.path_tags),
        JSON.stringify(next.featured_product_ids),
        next.pinned_post_id,
        next.location_label,
        next.pickup_note,
        JSON.stringify(next.hours),
        JSON.stringify(next.policies)
      )
      .run();
    return json({ storefront: await loadStorefront(env, auth.userId) });
  } catch (err) {
    console.error('[storefront.put] Error:', err);
    return error('DATABASE_ERROR', 'Failed to save your storefront', 500);
  }
}

// ---------------------------------------------------------------------------
// Owner: verification

type RequestRow = {
  business_id: string;
  status: string;
  website: string | null;
  registration_number: string | null;
  note: string | null;
  reason: string | null;
  reviewed_at: string | null;
  submitted_at: string;
};

async function loadVerificationFacts(env: Env, businessId: string) {
  const [profile, req] = await Promise.all([
    env.DB.prepare('SELECT verification_status FROM business_profiles WHERE user_id = ?')
      .bind(businessId)
      .first<{ verification_status: string | null }>(),
    env.DB.prepare('SELECT * FROM business_verification_requests WHERE business_id = ?')
      .bind(businessId)
      .first<RequestRow>(),
  ]);
  return {
    facts: { profileStatus: profile?.verification_status ?? null, requestStatus: req?.status ?? null },
    request: req,
    hasProfile: !!profile,
  };
}

async function getOwnVerification(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  try {
    const { facts, request: req } = await loadVerificationFacts(env, auth.userId);
    const status = verificationStatusOf(facts);
    return json({
      status,
      reason: status === 'rejected' ? req?.reason || null : null,
      submitted_at: req?.submitted_at || null,
      reviewed_at: req?.reviewed_at || null,
      website: req?.website || null,
      registration_number: req?.registration_number || null,
      note: req?.note || null,
    });
  } catch (err) {
    console.error('[storefront.verification.get] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load verification', 500);
  }
}

async function requestVerification(request: Request, env: Env): Promise<Response> {
  const auth = await requireBusiness(request, env);
  if (auth instanceof Response) return auth;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const parsed = verificationRequestSchema.safeParse(body ?? {});
  if (!parsed.success) return zodFail(parsed.error);
  const website = parsed.data.website || null;
  const registration = parsed.data.registration_number || null;
  const note = parsed.data.note || null;
  if (!website && !registration) {
    return error(
      'VALIDATION_ERROR',
      'Add your website or business registration number so we can check who you are.',
      400
    );
  }
  try {
    const { facts } = await loadVerificationFacts(env, auth.userId);
    if (isVerified(facts)) return error('ALREADY_VERIFIED', 'Your business is already verified.', 409);
    await env.DB.prepare(
      `INSERT INTO business_verification_requests
        (business_id, status, website, registration_number, note, reason, reviewed_by_admin_id, reviewed_at, submitted_at, updated_at)
       VALUES (?, 'pending', ?, ?, ?, NULL, NULL, NULL, datetime('now'), datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         status = 'pending',
         website = excluded.website,
         registration_number = excluded.registration_number,
         note = excluded.note,
         reason = NULL,
         reviewed_by_admin_id = NULL,
         reviewed_at = NULL,
         submitted_at = datetime('now'),
         updated_at = datetime('now')`
    )
      .bind(auth.userId, website, registration, note)
      .run();
    return json({ status: 'pending' as const });
  } catch (err) {
    console.error('[storefront.verification.post] Error:', err);
    return error('DATABASE_ERROR', 'Failed to send your request', 500);
  }
}

// ---------------------------------------------------------------------------
// Public storefront

type BusinessRow = {
  id: string;
  is_business: number;
  metadata: string | null;
  acct_status: string | null;
  acct_suspended_until: string | null;
  business_name: string | null;
  logo_url: string | null;
  display_name: string | null;
  profile_status: string | null;
  request_status: string | null;
};

/** The business behind a storefront, or null if it is not a live business account. */
async function loadBusiness(env: Env, businessId: string): Promise<(BusinessCard & { name: string; logo_url: string | null }) | null> {
  const row = await env.DB.prepare(
    `SELECT u.id, u.is_business, u.metadata,
            s.status AS acct_status, s.suspended_until AS acct_suspended_until,
            bs.business_name, bs.logo_url,
            bp.display_name, bp.verification_status AS profile_status,
            vr.status AS request_status
     FROM users u
     LEFT JOIN user_account_states s ON s.user_id = u.id
     LEFT JOIN business_settings bs ON bs.business_id = u.id
     LEFT JOIN business_profiles bp ON bp.user_id = u.id
     LEFT JOIN business_verification_requests vr ON vr.business_id = u.id
     WHERE u.id = ?`
  )
    .bind(businessId)
    .first<BusinessRow>();
  if (!row || !Number(row.is_business)) return null;
  if (restrictionFromState(row.acct_status, row.acct_suspended_until)) return null;
  const meta = parseJson<{ username?: string; avatar?: string }>(row.metadata, {});
  const username = typeof meta.username === 'string' && meta.username.trim() ? meta.username.trim() : 'Business';
  const avatar = typeof meta.avatar === 'string' && meta.avatar ? meta.avatar : null;
  return {
    id: row.id,
    username,
    avatar,
    name: row.business_name?.trim() || row.display_name?.trim() || username,
    logo_url: row.logo_url || avatar,
    verified: isVerified({ profileStatus: row.profile_status, requestStatus: row.request_status }),
  };
}

async function viewerBlocked(env: Env, viewerId: string | undefined, businessId: string): Promise<boolean> {
  if (!viewerId || viewerId === businessId) return false;
  return isBlocked(env, viewerId, businessId);
}

async function getPublicStorefront(request: Request, env: Env, businessId: string): Promise<Response> {
  try {
    const ctx = await getRequestContext(request, env);
    const viewerId = ctx.isAuthenticated ? ctx.userId : undefined;
    const business = await loadBusiness(env, businessId);
    if (!business || (await viewerBlocked(env, viewerId, businessId))) {
      return error('NOT_FOUND', 'Storefront not found', 404);
    }
    const storefront = await loadStorefront(env, businessId);
    const card: BusinessCard = {
      id: business.id,
      username: business.username,
      avatar: business.avatar,
      verified: business.verified,
    };

    const featuredIds = storefront.featured_product_ids;
    let featured: ReturnType<typeof productCard>[] = [];
    if (featuredIds.length) {
      const marks = featuredIds.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT p.* FROM products p WHERE p.user_id = ? AND p.id IN (${marks}) AND ${activeProductSql('p')}`
      )
        .bind(businessId, ...featuredIds)
        .all<ProductRow>();
      const byId = new Map((rows.results || []).map((r) => [r.id, r]));
      featured = featuredIds
        .map((id) => byId.get(id))
        .filter((r): r is ProductRow => !!r)
        .map((r) => productCard(r, card));
    }

    const [countRow, followersRow, pinned] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE p.user_id = ? AND ${activeProductSql('p')}`)
        .bind(businessId)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM user_relationships WHERE target_user_id = ? AND type = 'follow'`
      )
        .bind(businessId)
        .first<{ n: number }>(),
      storefront.pinned_post_id
        ? env.DB.prepare(
            `SELECT id, image_url, caption, category, subcategory, metadata, created_at
             FROM posts WHERE id = ? AND user_id = ? AND COALESCE(is_hidden, 0) = 0`
          )
            .bind(storefront.pinned_post_id, businessId)
            .first<{
              id: string;
              image_url: string | null;
              caption: string | null;
              category: string;
              subcategory: string | null;
              metadata: string | null;
              created_at: string;
            }>()
        : Promise.resolve(null),
    ]);

    let canMessage = false;
    const isOwner = viewerId === businessId;
    if (viewerId && !isOwner) {
      canMessage = (await messagingAccess(env, viewerId, businessId, ctx.user)) === 'ok';
    }

    const publicStorefront: Storefront = {
      ...storefront,
      featured_product_ids: featured.map((p) => p.id),
      pinned_post_id: pinned ? pinned.id : null,
    };

    return json({
      storefront: publicStorefront,
      business: {
        id: business.id,
        name: business.name,
        username: business.username,
        logo_url: business.logo_url,
        verified: business.verified,
        followers_count: Number(followersRow?.n || 0),
      },
      featured_products: featured,
      products_count: Number(countRow?.n || 0),
      pinned_post: pinned
        ? {
            id: pinned.id,
            image_url: pinned.image_url,
            caption: pinned.caption,
            category: pinned.category,
            subcategory: pinned.subcategory,
            metadata: parseJson<Record<string, unknown>>(pinned.metadata, {}),
            created_at: pinned.created_at,
          }
        : null,
      viewer: { is_owner: isOwner, can_message: canMessage },
    });
  } catch (err) {
    console.error('[storefront.public] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load storefront', 500);
  }
}

async function getPublicProducts(request: Request, env: Env, businessId: string): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10) || 24));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
  try {
    const ctx = await getRequestContext(request, env);
    const viewerId = ctx.isAuthenticated ? ctx.userId : undefined;
    const business = await loadBusiness(env, businessId);
    if (!business || (await viewerBlocked(env, viewerId, businessId))) {
      return error('NOT_FOUND', 'Storefront not found', 404);
    }
    const card: BusinessCard = {
      id: business.id,
      username: business.username,
      avatar: business.avatar,
      verified: business.verified,
    };
    const [rows, total] = await Promise.all([
      env.DB.prepare(
        `SELECT p.* FROM products p WHERE p.user_id = ? AND ${activeProductSql('p')}
         ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`
      )
        .bind(businessId, limit, offset)
        .all<ProductRow>(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM products p WHERE p.user_id = ? AND ${activeProductSql('p')}`)
        .bind(businessId)
        .first<{ n: number }>(),
    ]);
    const products = (rows.results || []).map((r) => productCard(r, card));
    const n = Number(total?.n || 0);
    return json({ products, total: n, limit, offset, has_more: offset + products.length < n });
  } catch (err) {
    console.error('[storefront.products] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load products', 500);
  }
}

async function getVerifiedBatch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const ids = (url.searchParams.get('ids') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (!ids.length) return json({ verified: [] });
  try {
    const set = await loadVerifiedSet(env, ids);
    return json({ verified: ids.filter((id) => set.has(id)) });
  } catch (err) {
    console.error('[storefront.verified] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load verification', 500);
  }
}

// ---------------------------------------------------------------------------
// Admin review

async function listVerifications(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(request, env, 'business.write');
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const statusParam = (url.searchParams.get('status') || 'pending').toLowerCase();
  const status = ['pending', 'verified', 'rejected', 'all'].includes(statusParam) ? statusParam : 'pending';
  try {
    const where = status === 'all' ? '' : 'WHERE vr.status = ?';
    const stmt = env.DB.prepare(
      `SELECT vr.*, u.email, u.metadata, bs.business_name, bp.display_name,
              bp.verification_status AS profile_status, au.email AS reviewed_by_email
       FROM business_verification_requests vr
       JOIN users u ON u.id = vr.business_id
       LEFT JOIN business_settings bs ON bs.business_id = vr.business_id
       LEFT JOIN business_profiles bp ON bp.user_id = vr.business_id
       LEFT JOIN admin_users au ON au.id = vr.reviewed_by_admin_id
       ${where}
       ORDER BY vr.submitted_at ${status === 'pending' ? 'ASC' : 'DESC'}
       LIMIT 200`
    );
    const rows = await (status === 'all' ? stmt : stmt.bind(status)).all<
      RequestRow & {
        email: string;
        metadata: string | null;
        business_name: string | null;
        display_name: string | null;
        profile_status: string | null;
        reviewed_by_email: string | null;
      }
    >();
    const verifications = (rows.results || []).map((r) => {
      const meta = parseJson<{ username?: string }>(r.metadata, {});
      return {
        business_id: r.business_id,
        business_name: r.business_name || r.display_name || meta.username || 'Business',
        email: r.email,
        status: verificationStatusOf({ profileStatus: r.profile_status, requestStatus: r.status }),
        website: r.website,
        registration_number: r.registration_number,
        note: r.note,
        reason: r.reason,
        submitted_at: r.submitted_at,
        reviewed_at: r.reviewed_at,
        reviewed_by: r.reviewed_by_email,
      };
    });
    return json({ verifications });
  } catch (err) {
    console.error('[storefront.admin.list] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load verification requests', 500);
  }
}

async function decideVerification(request: Request, env: Env, businessId: string): Promise<Response> {
  const admin = await requireAdmin(request, env, 'business.write');
  if (admin instanceof Response) return admin;
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const parsed = verificationDecisionSchema.safeParse(body);
  if (!parsed.success) return zodFail(parsed.error);
  const { approve } = parsed.data;
  const reason = parsed.data.reason || null;
  if (!approve && !reason) {
    return error('VALIDATION_ERROR', 'Add a short reason so the business knows what to fix.', 400);
  }
  try {
    const user = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_business = 1')
      .bind(businessId)
      .first<{ id: string }>();
    if (!user) return error('NOT_FOUND', 'Business account not found', 404);

    const { facts, hasProfile } = await loadVerificationFacts(env, businessId);
    const previous = verificationStatusOf(facts);
    const next = approve ? 'verified' : 'rejected';

    await env.DB.prepare(
      `INSERT INTO business_verification_requests
        (business_id, status, reason, reviewed_by_admin_id, reviewed_at, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(business_id) DO UPDATE SET
         status = excluded.status,
         reason = excluded.reason,
         reviewed_by_admin_id = excluded.reviewed_by_admin_id,
         reviewed_at = datetime('now'),
         updated_at = datetime('now')`
    )
      .bind(businessId, next, approve ? null : reason, admin.adminId)
      .run();
    if (hasProfile) {
      await env.DB.prepare(
        `UPDATE business_profiles SET verification_status = ?, updated_at = datetime('now') WHERE user_id = ?`
      )
        .bind(next, businessId)
        .run();
    }

    await writeAdminAudit(env, {
      adminId: admin.adminId,
      action: approve ? 'business.verification.approve' : 'business.verification.reject',
      targetType: 'business',
      targetId: businessId,
      reasonText: reason || undefined,
      metadata: { previous_status: previous, new_status: next },
      ipAddress: requestIp(request),
    });

    await createBusinessNotification(
      env,
      businessId,
      'verification',
      approve ? 'Your business is verified' : 'Verification needs another look',
      approve
        ? 'Shoppers now see a verified badge on your storefront and products.'
        : reason,
      { ref_type: 'verification', ref_id: businessId }
    );

    return json({ business_id: businessId, status: next, reason: approve ? null : reason });
  } catch (err) {
    console.error('[storefront.admin.decide] Error:', err);
    return error('DATABASE_ERROR', 'Failed to save the decision', 500);
  }
}
