/**
 * Generate a unique ID
 * Format: prefix_timestamp_random (random part from a CSPRNG)
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  return `${prefix}_${timestamp}_${random}`;
}
