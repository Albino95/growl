/** Shared category path matching (onboarding stores e.g. fitness:building-muscle). */

export function expandUserCategoryKeys(paths: string[]): Set<string> {
  const s = new Set<string>();
  for (const p of paths || []) {
    const x = String(p).trim().toLowerCase();
    if (!x) continue;
    s.add(x);
    const i = x.indexOf(':');
    if (i > 0) s.add(x.slice(0, i));
  }
  return s;
}

export function postMatchesUserCategories(
  userPaths: string[],
  postCategory: string,
  postSubcategory?: string | null
): boolean {
  if (!userPaths?.length) return true;
  const keys = expandUserCategoryKeys(userPaths);
  const c = postCategory.toLowerCase();
  const subKey = postSubcategory ? `${c}:${String(postSubcategory).toLowerCase()}` : '';
  if (keys.has(c)) return true;
  if (subKey && keys.has(subKey)) return true;
  for (const k of keys) {
    if (k.includes(':')) continue;
    if (c.startsWith(k) || k.startsWith(c)) return true;
  }
  return false;
}

/** When a post's stored path doesn't match the author's growth areas, use their first path. */
export function alignPostTaxonomy(
  ownerPaths: string[],
  category: string | null | undefined,
  subcategory?: string | null
): { category: string; subcategory: string | null } {
  const cat = String(category || '').trim();
  const sub = subcategory != null && String(subcategory).trim() ? String(subcategory).trim() : null;
  if (!ownerPaths?.length) {
    return { category: cat || 'general', subcategory: sub };
  }
  if (cat && postMatchesUserCategories(ownerPaths, cat, sub)) {
    return { category: cat, subcategory: sub };
  }
  const first = String(ownerPaths[0] || '').trim();
  if (!first) return { category: cat || 'general', subcategory: sub };
  if (first.includes(':')) {
    const [c, s] = first.split(':');
    return { category: c, subcategory: s || null };
  }
  return { category: first, subcategory: null };
}

export function categoryRelevanceScore(
  userPaths: string[],
  postCategory: string,
  postSubcategory?: string | null
): number {
  if (!userPaths?.length) return 10;
  const keys = expandUserCategoryKeys(userPaths);
  const c = postCategory.toLowerCase();
  const subKey = postSubcategory ? `${c}:${String(postSubcategory).toLowerCase()}` : '';
  let score = 0;
  if (keys.has(c)) score += 40;
  if (subKey && keys.has(subKey)) score += 55;
  for (const k of keys) {
    if (k.includes(':')) continue;
    if (c.startsWith(k) || k.startsWith(c)) score += 15;
  }
  return score;
}

/** Top-level growth paths (mirrors frontend/src/data/categories.ts keys). */
export const GROWTH_PATHS = [
  'fitness',
  'art',
  'nutrition',
  'mindset',
  'discipline',
  'martial-arts',
  'language',
  'coding',
  'sustainability',
  'wellness',
  'finance',
] as const;

export type GrowthPath = (typeof GROWTH_PATHS)[number];

const GROWTH_PATH_SET = new Set<string>(GROWTH_PATHS);

/** True for a known top-level path, or "path:sub" whose top level is known. */
export function isKnownGrowthPath(p: unknown): boolean {
  if (typeof p !== 'string') return false;
  const s = p.trim().toLowerCase();
  if (!s || s.length > 80) return false;
  const i = s.indexOf(':');
  const top = i > 0 ? s.slice(0, i) : s;
  if (!GROWTH_PATH_SET.has(top)) return false;
  return i < 0 || /^[a-z0-9-]+$/.test(s.slice(i + 1));
}
