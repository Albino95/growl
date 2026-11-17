/**
 * Parse a user-typed number that may use a comma or a dot as decimal separator
 * ("12,5" or "12.5"). Returns null for empty or non-numeric input.
 */
export function parseLocaleNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  // Only one separator allowed; a single comma is treated as the decimal point.
  if (!/^-?\d*([.,]\d*)?$/.test(cleaned) || cleaned === '.' || cleaned === ',' || cleaned === '-') {
    return null;
  }
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Format a money amount, honouring the currency code (default EUR). */
export function formatCurrency(amount: number, currency: string | null | undefined = 'EUR'): string {
  const code = (currency || 'EUR').toUpperCase();
  const whole = Math.round(amount * 100) % 100 === 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `€${amount.toFixed(2)}`;
  }
}
