/**
 * Typed seller-portal endpoints (business owner). Built on sellerClient's auth + envelope
 * handling. Endpoints that are still rolling out answer 404 "Route not found" — pages check
 * `isFeatureUnavailable` and show a calm "coming soon" state instead of an error.
 */
import { SellerApiError, sellerRequest } from './sellerClient';

export function isFeatureUnavailable(e: unknown): boolean {
  if (!(e instanceof SellerApiError)) return false;
  if (e.status === 501) return true;
  return e.status === 404 && (e.code === 'NOT_FOUND' || /route not found/i.test(e.message));
}

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function body(data: unknown): RequestInit {
  return { body: JSON.stringify(data) };
}

function idempotencyKey(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-${rand}`;
}

// ---------------------------------------------------------------------------
// Products

export type ProductStatus = 'active' | 'hidden' | 'moderated';

export type CatalogProduct = {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  subcategory?: string | null;
  price: number;
  stock: number;
  image_url?: string | null;
  images?: string[];
  metadata?: Record<string, unknown>;
  units_sold?: number;
  is_hidden?: number | null;
  hidden_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export function productStatus(p: Pick<CatalogProduct, 'is_hidden' | 'hidden_reason'>): ProductStatus {
  if (!Number(p.is_hidden || 0)) return 'active';
  return p.hidden_reason === 'seller_hidden' ? 'hidden' : 'moderated';
}

export function productSku(p: Pick<CatalogProduct, 'id' | 'metadata'>): string {
  const sku = p.metadata?.sku;
  if (typeof sku === 'string' && sku.trim()) return sku.trim();
  return `PRD-${p.id.slice(-6).toUpperCase()}`;
}

export function productImages(p: Pick<CatalogProduct, 'image_url' | 'images'>): string[] {
  const list = [...(p.image_url ? [p.image_url] : []), ...(Array.isArray(p.images) ? p.images : [])];
  return [...new Set(list.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u)))];
}

export async function listProducts() {
  const res = await sellerRequest<{ products: CatalogProduct[] }>('/business/products?period=month');
  return res.products || [];
}

export type ProductInput = {
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  price: number;
  stock: number;
  image_url?: string | null;
  images?: string[];
  metadata?: Record<string, unknown>;
};

export function createProduct(input: ProductInput) {
  return sellerRequest<CatalogProduct>('/marketplace/products', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    ...body(input),
  });
}

export function updateProduct(id: string, input: Partial<ProductInput>) {
  return sellerRequest<CatalogProduct>(`/marketplace/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    ...body(input),
  });
}

export function deleteProduct(id: string) {
  return sellerRequest<{ archived?: boolean }>(`/marketplace/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function duplicateProduct(id: string) {
  return sellerRequest<CatalogProduct>(`/business/products/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
  });
}

export type BulkItem = {
  id: string;
  price?: number;
  stock?: number;
  category?: string;
  subcategory?: string | null;
  status?: 'active' | 'hidden';
};

export const BULK_MAX = 50;

export function bulkUpdateProducts(items: BulkItem[]) {
  return sellerRequest<{ updated: number }>('/business/products/bulk', {
    method: 'PATCH',
    ...body({ items }),
  });
}

export type ImportRowResult = {
  row: number;
  action: 'create' | 'update' | 'unchanged' | 'error';
  product_id?: string;
  name?: string;
  sku?: string;
};

export type ImportReport = {
  dry_run: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  errors: Array<{ row: number; field?: string; message: string }>;
  rows: ImportRowResult[];
};

export const IMPORT_MAX = 500;

export function importProducts(rows: Array<Record<string, string>>, dryRun: boolean) {
  return sellerRequest<ImportReport>('/business/products/import', {
    method: 'POST',
    headers: dryRun ? {} : { 'Idempotency-Key': idempotencyKey() },
    ...body({ rows, dry_run: dryRun }),
  });
}

/** Public media upload (purpose 'product'). Returns the hosted https URL. */
export async function uploadProductImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('purpose', 'product');
  const res = await sellerRequest<{ url: string }>('/media/upload', { method: 'POST', body: form });
  if (!res.url) throw new SellerApiError('UPLOAD_FAILED', 'Upload failed', 500);
  return res.url;
}

/** Public media upload for storefront covers (stored like product photos). */
export const uploadImage = uploadProductImage;

// ---------------------------------------------------------------------------
// Orders

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';

/** Mirrors backend ALLOWED_TRANSITIONS (marketplace.ts). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

export type SellerOrderRow = {
  id: string;
  user_id: string;
  status: OrderStatus | string;
  total: number;
  business_total?: number;
  payment_status?: string;
  awaiting_payment?: boolean;
  created_at: string;
  updated_at?: string;
  shipping_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  items?: Array<{
    id: string;
    product_id: string;
    quantity: number;
    price: number;
    product_name?: string;
    product_image?: string | null;
  }>;
};

export const ORDERS_PAGE = 200;

export async function listOrders(offset = 0) {
  const res = await sellerRequest<SellerOrderRow[] | { orders: SellerOrderRow[] }>(
    `/business/orders?offset=${offset}`
  );
  return Array.isArray(res) ? res : res.orders || [];
}

export function getOrder(id: string) {
  return sellerRequest<SellerOrderRow>(`/business/orders/${encodeURIComponent(id)}`);
}

export function getOrderContact(id: string) {
  return sellerRequest<{
    can_message: boolean;
    reason: string;
    customer: { id: string; username: string | null };
  }>(`/business/orders/${encodeURIComponent(id)}/contact`);
}

export function setOrderStatus(id: string, status: OrderStatus) {
  return sellerRequest(`/marketplace/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    ...body({ status }),
  });
}

export function setOrderFulfillment(id: string, data: { tracking_number?: string; carrier?: string }) {
  return sellerRequest(`/business/orders/${encodeURIComponent(id)}/fulfillment`, {
    method: 'PATCH',
    ...body(data),
  });
}

// ---------------------------------------------------------------------------
// Customers + onboarding + settings

export type Customer = {
  user_id: string;
  email: string;
  username: string;
  avatar: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string;
};

export async function listCustomers() {
  const res = await sellerRequest<{ customers: Customer[] }>('/business/customers');
  return res.customers || [];
}

export type Onboarding = {
  steps: Array<{ key: string; done: boolean }>;
  done: number;
  total: number;
  complete: boolean;
};

export function getOnboarding() {
  return sellerRequest<Onboarding>('/business/onboarding');
}

export type BusinessSettings = {
  business_name: string;
  logo_url: string | null;
  analytics_prefs: Record<string, unknown>;
  notifications_prefs: Record<string, unknown>;
};

export function getSettings() {
  return sellerRequest<BusinessSettings>('/business/settings');
}

// ---------------------------------------------------------------------------
// Storefront + verification (helper A contract)

export type StorefrontHours = { day: number; open: string; close: string };
export type Storefront = {
  cover_url: string | null;
  tagline: string | null;
  about: string | null;
  links: Array<{ label: string; url: string }>;
  path_tags: string[];
  featured_product_ids: string[];
  pinned_post_id: string | null;
  location_label: string | null;
  pickup_note: string | null;
  hours: StorefrontHours[];
  policies: { shipping?: string | null; returns?: string | null; pickup?: string | null };
};

export function emptyStorefront(): Storefront {
  return {
    cover_url: null,
    tagline: '',
    about: '',
    links: [],
    path_tags: [],
    featured_product_ids: [],
    pinned_post_id: null,
    location_label: '',
    pickup_note: '',
    hours: [],
    policies: { shipping: '', returns: '', pickup: '' },
  };
}

export function normalizeStorefront(s: Partial<Storefront> | null | undefined): Storefront {
  const base = emptyStorefront();
  if (!s) return base;
  return {
    cover_url: s.cover_url ?? null,
    tagline: s.tagline ?? '',
    about: s.about ?? '',
    links: Array.isArray(s.links) ? s.links : [],
    path_tags: Array.isArray(s.path_tags) ? s.path_tags : [],
    featured_product_ids: Array.isArray(s.featured_product_ids) ? s.featured_product_ids : [],
    pinned_post_id: s.pinned_post_id ?? null,
    location_label: s.location_label ?? '',
    pickup_note: s.pickup_note ?? '',
    hours: Array.isArray(s.hours) ? s.hours : [],
    policies: { ...base.policies, ...(s.policies || {}) },
  };
}

export async function getStorefront() {
  const res = await sellerRequest<{ storefront: Partial<Storefront> | null }>('/business/storefront');
  return normalizeStorefront(res.storefront);
}

export async function saveStorefront(patch: Partial<Storefront>) {
  const res = await sellerRequest<{ storefront: Partial<Storefront> }>('/business/storefront', {
    method: 'PUT',
    ...body(patch),
  });
  return normalizeStorefront(res.storefront);
}

export type PublicStorefront = {
  storefront: Partial<Storefront> | null;
  business: { id: string; name: string; logo_url: string | null; verified: boolean; followers_count?: number };
  featured_products: Array<{ id: string; name: string; price: number; image_url?: string | null }>;
  products_count: number;
};

export function getPublicStorefront(businessId: string) {
  return sellerRequest<PublicStorefront>(`/storefronts/${encodeURIComponent(businessId)}`);
}

export type VerificationStatus = { status: 'none' | 'pending' | 'verified' | 'rejected'; reason?: string | null };

export function getVerification() {
  return sellerRequest<VerificationStatus>('/business/verification');
}

export function requestVerification(data: { website?: string; registration_number?: string; note?: string }) {
  return sellerRequest<{ status: 'pending' }>('/business/verification', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    ...body(data),
  });
}

export type OwnPost = { id: string; caption?: string | null; image_url?: string | null; created_at?: string };

export async function listOwnPosts(userId: string) {
  const res = await sellerRequest<OwnPost[] | { posts: OwnPost[] }>(
    `/feed/posts/user/${encodeURIComponent(userId)}`
  );
  return Array.isArray(res) ? res : res.posts || [];
}

// ---------------------------------------------------------------------------
// Insights + partner links (helper B contract)

export type InsightsPeriod = '7d' | '30d' | '90d';
export type InsightTotals = {
  storefront_views: number;
  product_views: number;
  saves: number;
  link_taps: number;
  partner_clicks: number;
};
export type Insights = {
  period: InsightsPeriod;
  totals: InsightTotals;
  previous: InsightTotals;
  daily: Array<{ day: string; storefront_views: number; product_views: number; saves: number }>;
  top_products: Array<{ id: string; name: string; image_url: string | null; views: number; saves: number }>;
  sources: Array<{ source: string; views: number }>;
  audience: { top_paths: Array<{ path: string; share: number }> } | null;
};

export function getInsights(period: InsightsPeriod) {
  return sellerRequest<Insights>(`/business/insights?period=${period}`);
}

export type PartnerLink = {
  id: string;
  partnership_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  instructor: { id: string; name: string };
  code: string;
  url: string;
  clicks: number;
  saves_attributed: number;
  created_at: string;
};

export async function listPartnerLinks() {
  const res = await sellerRequest<{ links: PartnerLink[] }>('/business/partner-links');
  return res.links || [];
}

export async function createPartnerLink(data: { partnership_id: string; product_id?: string | null }) {
  const res = await sellerRequest<{ link: PartnerLink | null; links: PartnerLink[] }>(
    '/business/partner-links',
    { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, ...body(data) }
  );
  return res.links || [];
}

export function deletePartnerLink(id: string) {
  return sellerRequest<{ ok: boolean }>(`/business/partner-links/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export type Partnership = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  status: string;
};

export async function listActivePartnerships() {
  const res = await sellerRequest<{ partnerships?: Partnership[] } | Partnership[]>('/business/partnerships');
  const list = Array.isArray(res) ? res : res.partnerships || [];
  return list.filter((p) => p.status === 'active');
}

// ---------------------------------------------------------------------------
// Engagement (helper C contract)

export type Person = { id: string; name: string; avatar_url: string | null };
export type ProductRef = { id: string; name: string; image_url: string | null } | null;

export type BusinessQuestion = {
  id: string;
  product_id: string;
  body: string;
  asker: Person;
  created_at: string;
  answer?: { body: string; answered_at: string };
  product: ProductRef;
};

export type BusinessReview = {
  id: string;
  product_id: string;
  rating: number;
  body: string;
  author: Person;
  created_at: string;
  verified_purchase: boolean;
  reply?: { body: string; replied_at: string };
  product: ProductRef;
};

export async function listQuestions(status: 'unanswered' | 'all') {
  const res = await sellerRequest<{ questions: BusinessQuestion[] }>(`/business/questions?status=${status}`);
  return res.questions || [];
}

export function answerQuestion(id: string, text: string) {
  return sellerRequest(`/business/questions/${encodeURIComponent(id)}/answer`, {
    method: 'POST',
    ...body({ body: text }),
  });
}

export function hideQuestion(id: string) {
  return sellerRequest(`/business/questions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listReviews(status: 'unreplied' | 'all') {
  const res = await sellerRequest<{ reviews: BusinessReview[] }>(`/business/reviews?status=${status}`);
  return res.reviews || [];
}

export function replyReview(id: string, text: string) {
  return sellerRequest(`/business/reviews/${encodeURIComponent(id)}/reply`, {
    method: 'POST',
    ...body({ body: text }),
  });
}

export type SavedReply = { id?: string; title: string; body: string };
export type AwaySettings = {
  enabled: boolean;
  message: string;
  schedule: { days: number[]; from: string; to: string } | null;
};
export type InboxSettings = { saved_replies: SavedReply[]; away: AwaySettings };

export function getInboxSettings() {
  return sellerRequest<InboxSettings>('/business/inbox-settings');
}

export function saveInboxSettings(data: Partial<InboxSettings>) {
  return sellerRequest<InboxSettings>('/business/inbox-settings', { method: 'PUT', ...body(data) });
}

export function getEngageSummary() {
  return sellerRequest<{ unanswered_questions: number; unreplied_reviews: number }>('/business/engage/summary');
}
