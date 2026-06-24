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
