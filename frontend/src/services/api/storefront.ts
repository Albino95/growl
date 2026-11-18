/**
 * Business storefront API — backend/src/routes/wave3/storefront.ts (migration 0048).
 * Every call throws ApiError; a 404 on the owner GET means the feature isn't deployed yet.
 */
import { request, ApiError } from './http';
import type { Product } from './marketplace';
import { logEvent, type InsightSource } from '../events';

type Envelope<T> = { success: boolean; data: T };

export const STOREFRONT_LIMITS = {
  tagline: 80,
  about: 1200,
  links: 4,
  linkLabel: 40,
  pathTags: 3,
  featured: 6,
  locationLabel: 80,
  pickupNote: 200,
  hours: 14,
  shipping: 600,
  returns: 600,
  pickup: 400,
} as const;

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

export type StorefrontPatch = Partial<
  Omit<Storefront, 'business_id' | 'updated_at' | 'policies'> & { policies: Partial<StorefrontPolicies> }
>;

export type StorefrontProduct = Product & {
  sold_out?: boolean;
  business?: Product['business'] & { verified?: boolean };
};

export type StorefrontBusiness = {
  id: string;
  name: string;
  username: string;
  logo_url: string | null;
  verified: boolean;
  followers_count?: number;
};

export type StorefrontPinnedPost = {
  id: string;
  image_url: string | null;
  caption: string | null;
  category: string;
  subcategory: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type PublicStorefront = {
  storefront: Storefront;
  business: StorefrontBusiness;
  featured_products: StorefrontProduct[];
  products_count: number;
  pinned_post: StorefrontPinnedPost | null;
  viewer?: { is_owner: boolean; can_message: boolean };
};

export type StorefrontProductsPage = {
  products: StorefrontProduct[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type VerificationStatus = 'none' | 'pending' | 'verified' | 'rejected';

export type VerificationState = {
  status: VerificationStatus;
  reason?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  website?: string | null;
  registration_number?: string | null;
  note?: string | null;
};

export function emptyStorefront(businessId = ''): Storefront {
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

/** True for https://host… — the only links a storefront may carry. */
export function isHttpsLink(raw: string): boolean {
  return /^https:\/\/[^\s/:@]+(\.[^\s/:@]+)+([/?#][^\s]*)?$/i.test(raw.trim());
}

/** "example.com" → "https://example.com"; leaves full https links alone. */
export function normalizeLink(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return `https://${t.slice(7)}`;
  if (/^[a-z]+:/i.test(t)) return t; // other schemes stay invalid on purpose
  return `https://${t}`;
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Is the shop open at `now` (device-local time)? null when no hours are set. */
export function isOpenNow(hours: StorefrontHours[], now: Date = new Date()): boolean | null {
  if (!hours.length) return null;
  const day = now.getDay();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return hours.some((h) => h.day === day && h.open <= hhmm && hhmm < h.close);
}

export async function getMyStorefront(): Promise<Storefront> {
  const res = await request<Envelope<{ storefront: Storefront }>>('/business/storefront');
  return res.data.storefront;
}

export async function saveMyStorefront(patch: StorefrontPatch): Promise<Storefront> {
  const res = await request<Envelope<{ storefront: Storefront }>>('/business/storefront', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
  return res.data.storefront;
}

export async function getPublicStorefront(businessId: string): Promise<PublicStorefront> {
  const res = await request<Envelope<PublicStorefront>>(`/storefronts/${encodeURIComponent(businessId)}`);
  return res.data;
}

export async function getStorefrontProducts(
  businessId: string,
  params: { limit?: number; offset?: number } = {}
): Promise<StorefrontProductsPage> {
  const q = new URLSearchParams();
  q.set('limit', String(params.limit ?? 24));
  q.set('offset', String(params.offset ?? 0));
  const res = await request<Envelope<StorefrontProductsPage>>(
    `/storefronts/${encodeURIComponent(businessId)}/products?${q.toString()}`
  );
  return res.data;
}

// Verified flags are cached per app session; the badge is decoration, never a blocker.
const verifiedCache = new Map<string, boolean>();

export async function getVerifiedBusinesses(ids: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const missing = unique.filter((id) => !verifiedCache.has(id)).slice(0, 50);
  if (missing.length) {
    try {
      const res = await request<Envelope<{ verified: string[] }>>(
        `/storefronts/verified?ids=${missing.map(encodeURIComponent).join(',')}`
      );
      const yes = new Set(res.data.verified || []);
      for (const id of missing) verifiedCache.set(id, yes.has(id));
    } catch {
      // Not deployed / offline: no badge.
    }
  }
  return new Set(unique.filter((id) => verifiedCache.get(id)));
}

export async function getMyVerification(): Promise<VerificationState> {
  const res = await request<Envelope<VerificationState>>('/business/verification');
  return res.data;
}

export async function requestVerification(body: {
  website?: string;
  registration_number?: string;
  note?: string;
}): Promise<{ status: VerificationStatus }> {
  const res = await request<Envelope<{ status: VerificationStatus }>>('/business/verification', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

/**
 * Fire-and-forget storefront_view for business insights (batched POST /events via
 * services/events; failures and a missing endpoint are ignored there).
 */
export function logStorefrontView(businessId: string, source: InsightSource = 'other'): void {
  try {
    logEvent({ type: 'storefront_view', business_id: businessId, source });
  } catch {
    // Insights are best-effort.
  }
}

/** Fire-and-forget link_tap from a storefront link. */
export function logStorefrontLinkTap(businessId: string): void {
  try {
    logEvent({ type: 'link_tap', business_id: businessId, source: 'storefront' });
  } catch {
    // Insights are best-effort.
  }
}

export function isNotDeployed(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
