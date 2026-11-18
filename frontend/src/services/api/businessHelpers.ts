/**
 * Pure helpers for the Business screens (no React / network), unit-tested in
 * businessHelpers.test.ts.
 */
import { parseLocaleNumber } from '../../utils/money';

// ---------------------------------------------------------------------------
// KPI deltas that don't invent growth

export type KpiDelta = { label: string; trend: 'up' | 'down' | 'neutral'; a11y: string };

/**
 * Change vs the previous period. With no earlier data there is nothing to compare to,
 * so say so instead of the server's "+100%" / "0%".
 */
export function kpiDelta(current: number, previous: number | undefined, pct: number | undefined): KpiDelta {
  const cur = Number(current) || 0;
  if (previous === undefined) {
    // Older backend: only the percentage is available.
    const p = Number(pct) || 0;
    if (cur === 0 && p === 0) return { label: '—', trend: 'neutral', a11y: 'no change' };
    return fromPct(p);
  }
  const prev = Number(previous) || 0;
  if (prev === 0 && cur === 0) return { label: '—', trend: 'neutral', a11y: 'no data yet' };
  if (prev === 0) return { label: 'New', trend: 'up', a11y: 'first activity this period' };
  return fromPct(((cur - prev) / prev) * 100);
}

function fromPct(p: number): KpiDelta {
  const rounded = Math.round(p);
  if (rounded === 0) return { label: '0%', trend: 'neutral', a11y: 'unchanged from last period' };
  const sign = rounded > 0 ? '+' : '−';
  return {
    label: `${sign}${Math.abs(rounded)}%`,
    trend: rounded > 0 ? 'up' : 'down',
    a11y: `${rounded > 0 ? 'up' : 'down'} ${Math.abs(rounded)} percent from last period`,
  };
}

// ---------------------------------------------------------------------------
// Onboarding checklist

export type OnboardingStepKey =
  | 'profile'
  | 'logo'
  | 'first_product'
  | 'product_photos'
  | 'shipping_note'
  | 'first_post';

export type OnboardingAction = 'settings' | 'add_product' | 'catalog' | 'post';

export const ONBOARDING_COPY: Record<
  OnboardingStepKey,
  { title: string; hint: string; icon: string; action: OnboardingAction }
> = {
  profile: {
    title: 'Name your store',
    hint: 'The name customers see on your products.',
    icon: 'storefront-outline',
    action: 'settings',
  },
  logo: {
    title: 'Add a logo',
    hint: 'A square image makes your store recognisable.',
    icon: 'image-outline',
    action: 'settings',
  },
  first_product: {
    title: 'Add your first product',
    hint: 'Name, price, stock and a photo — about a minute.',
    icon: 'cube-outline',
    action: 'add_product',
  },
  product_photos: {
    title: 'Give every product a photo',
    hint: 'Products with photos get far more taps.',
    icon: 'camera-outline',
    action: 'catalog',
  },
  shipping_note: {
    title: 'Write a shipping or pickup note',
    hint: 'E.g. “Ships in 2 days” or “Pick up in Esch”.',
    icon: 'cube-outline',
    action: 'settings',
  },
  first_post: {
    title: 'Introduce yourself with a post',
    hint: 'Posts are how people on Grow! discover you.',
    icon: 'create-outline',
    action: 'post',
  },
};

export type OnboardingStatus = {
  steps: Array<{ key: string; done: boolean }>;
  done: number;
  total: number;
  complete: boolean;
};

/** Known steps only (an older/newer server may send keys this build doesn't know). */
export function onboardingRows(status: OnboardingStatus | null | undefined) {
  if (!status) return [];
  return status.steps
    .filter((s): s is { key: OnboardingStepKey; done: boolean } => s.key in ONBOARDING_COPY)
    .map((s) => ({ ...s, ...ONBOARDING_COPY[s.key] }));
}

// ---------------------------------------------------------------------------
// Bulk price / stock edit

export const BULK_EDIT_MAX = 50;

export type BulkEditDraft = Record<string, { price?: string; stock?: string }>;
export type BulkEditItem = { id: string; price?: number; stock?: number };

/**
 * Turn the text fields of a bulk edit into an API payload containing only real changes.
 * Errors are keyed by product id so the row can show them.
 */
export function bulkChanges(
  products: Array<{ id: string; price: number; stock: number }>,
  draft: BulkEditDraft
): { items: BulkEditItem[]; errors: Record<string, string> } {
  const items: BulkEditItem[] = [];
  const errors: Record<string, string> = {};
  for (const p of products) {
    const d = draft[p.id];
    if (!d) continue;
    const item: BulkEditItem = { id: p.id };
    if (d.price !== undefined && d.price.trim() !== '') {
      const price = parseLocaleNumber(d.price);
      if (price == null || price <= 0) {
        errors[p.id] = 'Price must be above 0';
        continue;
      }
      const rounded = Math.round(price * 100) / 100;
      if (rounded !== Math.round(Number(p.price) * 100) / 100) item.price = rounded;
    }
    if (d.stock !== undefined && d.stock.trim() !== '') {
      const stock = parseLocaleNumber(d.stock);
      if (stock == null || stock < 0 || !Number.isInteger(stock)) {
        errors[p.id] = 'Stock must be a whole number, 0 or more';
        continue;
      }
      if (stock !== Number(p.stock)) item.stock = stock;
    }
    if (item.price !== undefined || item.stock !== undefined) items.push(item);
  }
  return { items, errors };
}

// ---------------------------------------------------------------------------
// Customer contact

export type ContactReason = 'ok' | 'blocked' | 'not_accepting' | 'unavailable';

export function contactCopy(reason: ContactReason | null | undefined): string | null {
  switch (reason) {
    case 'ok':
    case null:
    case undefined:
      return null;
    case 'not_accepting':
      return "This customer isn't taking messages right now. Their privacy settings are respected.";
    case 'blocked':
      return "You can't message this customer.";
    default:
      return 'Messaging isn’t available for this order.';
  }
}

// ---------------------------------------------------------------------------
// Product form

export type ProductFormValues = {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: string;
  stock: string;
  imageUrl: string;
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  description: '',
  category: '',
  subcategory: '',
  price: '',
  stock: '',
  imageUrl: '',
};

export function productFormDirty(a: ProductFormValues, b: ProductFormValues): boolean {
  return (Object.keys(a) as Array<keyof ProductFormValues>).some(
    (k) => (a[k] || '').trim() !== (b[k] || '').trim()
  );
}

/** A draft is worth restoring only if the seller typed something meaningful. */
export function productDraftWorthKeeping(v: ProductFormValues): boolean {
  return Boolean(v.name.trim() || v.description.trim() || v.price.trim() || v.imageUrl.trim());
}

/** Field-level validation for the product form; empty object = valid. */
export function validateProductForm(v: ProductFormValues): Partial<Record<keyof ProductFormValues, string>> {
  const errors: Partial<Record<keyof ProductFormValues, string>> = {};
  if (!v.name.trim()) errors.name = 'Give the product a name';
  else if (v.name.trim().length > 120) errors.name = 'Keep the name under 120 characters';
  if (!v.category) errors.category = 'Pick a category';
  const price = parseLocaleNumber(v.price);
  if (price == null || price <= 0) errors.price = 'Enter a price above 0, e.g. 12,50';
  const stock = parseLocaleNumber(v.stock);
  if (stock == null || stock < 0 || !Number.isInteger(stock)) errors.stock = 'Enter a whole number of 0 or more';
  return errors;
}

// ---------------------------------------------------------------------------
// Orders

export const ORDER_FILTERS = ['all', 'pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'] as const;

export function orderFilterLabel(filter: string): string {
  if (filter === 'pending') return 'To fulfill';
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}

export type BusinessNotificationTarget =
  | { kind: 'order'; id: string }
  | { kind: 'catalog'; filter: 'low' | 'out' | 'all' }
  | { kind: 'questions_reviews' }
  | { kind: 'verification' };

/** Business notification → where tapping it should go. */
export function notificationTarget(
  refType: string | null | undefined,
  refId: string | null | undefined,
  type?: string | null
): BusinessNotificationTarget | null {
  if (refType === 'order' && refId) return { kind: 'order', id: refId };
  if (refType === 'product_question' || refType === 'product_review') return { kind: 'questions_reviews' };
  if (refType === 'verification' || type === 'verification') return { kind: 'verification' };
  if (refType === 'product') {
    return { kind: 'catalog', filter: type === 'out_of_stock' ? 'out' : type === 'low_stock' ? 'low' : 'all' };
  }
  return null;
}

/** Icon for a business notification row in the dashboard action inbox. */
export function businessNotificationIcon(refType: string | null | undefined, type?: string | null): string {
  if (refType === 'product_question' || type === 'product_question') return 'chatbubble-ellipses-outline';
  if (refType === 'product_review' || type === 'product_review') return 'star-outline';
  if (refType === 'verification' || type === 'verification') return 'shield-checkmark-outline';
  if (refType === 'order') return 'receipt-outline';
  if (refType === 'product') return 'cube-outline';
  return 'notifications-outline';
}
