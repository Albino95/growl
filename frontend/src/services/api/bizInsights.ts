/**
 * Business insights without orders (backend: routes/wave3/bizinsights.ts).
 * Storefront/product views, saves, link taps and partner tracked links. Getters return
 * null on 404 so screens simply hide the section on servers without the feature.
 * (Named bizInsights to stay clear of the personal `insights.ts` client.)
 */
import { request, ApiError } from './http';
import { newIdempotencyKey } from './idempotency';
import type { Product } from './marketplace';

type Envelope<T> = { success: boolean; data: T };

export type InsightsPeriod = '7d' | '30d' | '90d';

export type InsightsTotals = {
  storefront_views: number;
  product_views: number;
  saves: number;
  link_taps: number;
  partner_clicks: number;
};

export type InsightsDay = { day: string; storefront_views: number; product_views: number; saves: number };

export type BizInsights = {
  period: InsightsPeriod;
  totals: InsightsTotals;
  previous: InsightsTotals;
  daily: InsightsDay[];
  top_products: Array<{ id: string; name: string; image_url: string | null; views: number; saves: number }>;
  sources: Array<{ source: string; views: number }>;
  /** null below the privacy threshold (fewer than 20 distinct signed-in viewers). */
  audience: { top_paths: Array<{ path: string; share: number }> } | null;
};

const ZERO: InsightsTotals = { storefront_views: 0, product_views: 0, saves: 0, link_taps: 0, partner_clicks: 0 };

function totals(t: Partial<InsightsTotals> | null | undefined): InsightsTotals {
  return {
    storefront_views: Number(t?.storefront_views) || 0,
    product_views: Number(t?.product_views) || 0,
    saves: Number(t?.saves) || 0,
    link_taps: Number(t?.link_taps) || 0,
    partner_clicks: Number(t?.partner_clicks) || 0,
  };
}

export async function getBizInsights(period: InsightsPeriod = '7d'): Promise<BizInsights | null> {
  try {
    const res = await request<Envelope<BizInsights>>(`/business/insights?period=${period}`);
    const d = res?.data;
    if (!d || !d.totals) return null;
    return {
      period: d.period ?? period,
      totals: totals(d.totals),
      previous: totals(d.previous ?? ZERO),
      daily: Array.isArray(d.daily) ? d.daily : [],
      top_products: Array.isArray(d.top_products) ? d.top_products : [],
      sources: Array.isArray(d.sources) ? d.sources : [],
      audience: d.audience && Array.isArray(d.audience.top_paths) ? d.audience : null,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Sum of everything people did — 0 means "nothing yet" (show the empty state). */
export function insightsActivity(t: InsightsTotals): number {
  return t.storefront_views + t.product_views + t.saves + t.link_taps + t.partner_clicks;
}

/** Percent change vs the previous period, or null when there is nothing to compare. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------------------------------------------------------------------------
// Saves

export type SaveState = { saved: boolean; saves: number };

export async function saveProduct(productId: string): Promise<SaveState> {
  const res = await request<Envelope<SaveState>>(`/products/${encodeURIComponent(productId)}/save`, {
    method: 'POST',
    idempotencyKey: newIdempotencyKey(),
  });
  return { saved: !!res.data?.saved, saves: Number(res.data?.saves) || 0 };
}

export async function unsaveProduct(productId: string): Promise<SaveState> {
  const res = await request<Envelope<SaveState>>(`/products/${encodeURIComponent(productId)}/save`, {
    method: 'DELETE',
  });
  return { saved: !!res.data?.saved, saves: Number(res.data?.saves) || 0 };
}

export type SavedProduct = Product & { saved_at?: string };

/** null when the server has no saves yet (404). */
export async function getSavedProducts(): Promise<SavedProduct[] | null> {
  try {
    const res = await request<Envelope<{ products: SavedProduct[] }>>('/me/saved-products');
    return Array.isArray(res.data?.products) ? res.data.products : [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Partner tracked links

export type PartnerLink = {
  id: string;
  partnership_id: string | null;
  product_id: string | null;
  product_name: string | null;
  code: string;
  url: string;
  clicks: number;
  saves_attributed: number;
  created_at: string;
  /** Business side. */
  instructor?: { id: string; name: string };
  /** Instructor side. */
  business?: { id: string; name: string };
};

export async function listPartnerLinks(): Promise<PartnerLink[] | null> {
  try {
    const res = await request<Envelope<{ links: PartnerLink[] }>>('/business/partner-links');
    return Array.isArray(res.data?.links) ? res.data.links : [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function createPartnerLink(
  input: { partnership_id?: string; instructor_id?: string; product_id?: string | null },
  idempotencyKey: string = newIdempotencyKey()
): Promise<{ link: PartnerLink | null; links: PartnerLink[] }> {
  const res = await request<Envelope<{ link: PartnerLink | null; links: PartnerLink[] }>>('/business/partner-links', {
    method: 'POST',
    body: JSON.stringify(input),
    idempotencyKey,
  });
  return { link: res.data?.link ?? null, links: Array.isArray(res.data?.links) ? res.data.links : [] };
}

export async function deletePartnerLink(id: string): Promise<void> {
  await request(`/business/partner-links/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Instructor side: links businesses made for you. null on 404. */
export async function listMyPartnerLinks(): Promise<PartnerLink[] | null> {
  try {
    const res = await request<Envelope<{ links: PartnerLink[] }>>('/instructor/partner-links');
    return Array.isArray(res.data?.links) ? res.data.links : [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Resolves https://letsgrow.lu/p/<code> (counts one click). null when unknown/removed. */
export async function resolvePartnerLink(
  code: string
): Promise<{ business_id: string; product_id: string | null; instructor_id: string } | null> {
  try {
    const res = await request<Envelope<{ business_id: string; product_id: string | null; instructor_id: string }>>(
      `/partner-links/${encodeURIComponent(code)}`
    );
    return res.data?.business_id ? res.data : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
