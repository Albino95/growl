/** Safe JSON parse — never throws. */
export function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

export type ShippingAddress = {
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  [key: string]: unknown;
};

export function parseShippingAddress(raw: unknown): ShippingAddress {
  return safeParseJson<ShippingAddress>(raw, {});
}
