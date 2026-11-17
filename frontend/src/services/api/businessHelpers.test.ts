import { describe, it, expect } from 'vitest';
import {
  kpiDelta,
  onboardingRows,
  bulkChanges,
  contactCopy,
  productFormDirty,
  productDraftWorthKeeping,
  validateProductForm,
  EMPTY_PRODUCT_FORM,
  orderFilterLabel,
  ORDER_FILTERS,
  notificationTarget,
} from './businessHelpers';

describe('kpiDelta', () => {
  it('shows a dash with no data in either period', () => {
    expect(kpiDelta(0, 0, 0)).toMatchObject({ label: '—', trend: 'neutral' });
  });
  it('says New instead of +100% when there is nothing to compare to', () => {
    expect(kpiDelta(5, 0, 100)).toMatchObject({ label: 'New', trend: 'up' });
  });
  it('computes a signed percentage from raw values', () => {
    expect(kpiDelta(15, 10, 50)).toMatchObject({ label: '+50%', trend: 'up' });
    expect(kpiDelta(5, 10, -50)).toMatchObject({ label: '−50%', trend: 'down' });
    expect(kpiDelta(10, 10, 0)).toMatchObject({ label: '0%', trend: 'neutral' });
  });
  it('falls back to the server percentage on older backends', () => {
    expect(kpiDelta(0, undefined, 0).label).toBe('—');
    expect(kpiDelta(3, undefined, 20).label).toBe('+20%');
  });
});

describe('onboardingRows', () => {
  it('maps known steps to copy and drops unknown keys', () => {
    const rows = onboardingRows({
      steps: [
        { key: 'profile', done: true },
        { key: 'future_step', done: false },
        { key: 'first_product', done: false },
      ],
      done: 1,
      total: 3,
      complete: false,
    });
    expect(rows.map((r) => r.key)).toEqual(['profile', 'first_product']);
    expect(rows[1].action).toBe('add_product');
  });
  it('handles a missing status', () => {
    expect(onboardingRows(null)).toEqual([]);
  });
});

describe('bulkChanges', () => {
  const products = [
    { id: 'a', price: 10, stock: 5 },
    { id: 'b', price: 20, stock: 0 },
    { id: 'c', price: 30, stock: 1 },
  ];
  it('sends only changed fields and accepts comma decimals', () => {
    const { items, errors } = bulkChanges(products, {
      a: { price: '10,00', stock: '8' },
      b: { price: '19,5' },
      c: { stock: '1' },
    });
    expect(errors).toEqual({});
    expect(items).toEqual([
      { id: 'a', stock: 8 },
      { id: 'b', price: 19.5 },
    ]);
  });
  it('reports invalid values per row', () => {
    const { items, errors } = bulkChanges(products, { a: { price: '0' }, b: { stock: '1.5' } });
    expect(items).toEqual([]);
    expect(Object.keys(errors).sort()).toEqual(['a', 'b']);
  });
});

describe('contactCopy', () => {
  it('is silent when messaging is allowed', () => {
    expect(contactCopy('ok')).toBeNull();
    expect(contactCopy(undefined)).toBeNull();
  });
  it('explains privacy refusals without blaming the seller', () => {
    expect(contactCopy('not_accepting')).toMatch(/privacy/);
    expect(contactCopy('unavailable')).toBeTruthy();
  });
});

describe('product form helpers', () => {
  it('detects edits ignoring surrounding whitespace', () => {
    expect(productFormDirty(EMPTY_PRODUCT_FORM, { ...EMPTY_PRODUCT_FORM, name: '  ' })).toBe(false);
    expect(productFormDirty(EMPTY_PRODUCT_FORM, { ...EMPTY_PRODUCT_FORM, name: 'Mat' })).toBe(true);
  });
  it('keeps drafts only with meaningful input', () => {
    expect(productDraftWorthKeeping({ ...EMPTY_PRODUCT_FORM, category: 'fitness' })).toBe(false);
    expect(productDraftWorthKeeping({ ...EMPTY_PRODUCT_FORM, price: '5' })).toBe(true);
  });
  it('validates each field', () => {
    const errors = validateProductForm(EMPTY_PRODUCT_FORM);
    expect(Object.keys(errors).sort()).toEqual(['category', 'name', 'price', 'stock']);
    expect(
      validateProductForm({ ...EMPTY_PRODUCT_FORM, name: 'Mat', category: 'fitness', price: '12,50', stock: '3' })
    ).toEqual({});
  });
});

describe('orders + notifications', () => {
  it('labels every filter including completed', () => {
    expect(ORDER_FILTERS).toContain('completed');
    expect(orderFilterLabel('pending')).toBe('To fulfill');
    expect(orderFilterLabel('completed')).toBe('Completed');
  });
  it('routes product notifications to the catalog filter', () => {
    expect(notificationTarget('order', 'o1')).toEqual({ kind: 'order', id: 'o1' });
    expect(notificationTarget('product', 'p1', 'low_stock')).toEqual({ kind: 'catalog', filter: 'low' });
    expect(notificationTarget('product', 'p1', 'out_of_stock')).toEqual({ kind: 'catalog', filter: 'out' });
    expect(notificationTarget(null, null)).toBeNull();
  });
});
