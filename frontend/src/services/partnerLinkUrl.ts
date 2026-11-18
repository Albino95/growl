/**
 * Pure parsing for partner tracked links (no React Native imports — vitest).
 *
 *   growl://p/<code>
 *   https://letsgrow.lu/p/<code>  (and www.)
 */
export function parsePartnerLinkUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const m = /^(?:growl:\/\/|https:\/\/(?:www\.)?letsgrow\.lu\/)p\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  let code = m[1];
  try {
    code = decodeURIComponent(code);
  } catch {
    // keep raw
  }
  code = code.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return code.length > 0 && code.length <= 40 ? code : null;
}
