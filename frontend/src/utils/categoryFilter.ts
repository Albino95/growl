/**
 * Category chip filters for Home / Explore feeds.
 *
 * Cross-path visibility rule (see docs/FEATURES.md):
 * - Unfiltered (All): show all in-scope posts — Home = friends (any path) + own;
 *   Explore = non-friends. Cross-path friends' posts appear on Home / All.
 * - Category-filtered: only posts whose category matches the selected path
 *   (parent key matches that parent or any leaf under it; leaf key matches exactly).
 *   A Fitness user who befriended someone in Arts sees their Arts posts under All
 *   (and under an Arts chip if present), not under the Fitness chip.
 */

export function postMatchesCategoryFilter(
  post: { category?: string | null; subcategory?: string | null },
  selectedKey: string | null | undefined
): boolean {
  if (!selectedKey) return true;
  const rawCat = String(post.category || '')
    .trim()
    .toLowerCase();
  const rawSub = String(post.subcategory || '')
    .trim()
    .toLowerCase();
  const sel = selectedKey.trim().toLowerCase();
  if (!sel) return true;

  // Normalize posts that store "fitness:cardio" in category with empty subcategory.
  let cat = rawCat;
  let sub = rawSub;
  if (!sub && rawCat.includes(':')) {
    const [c, s] = rawCat.split(':');
    cat = c;
    sub = s || '';
  }

  if (sel.includes(':')) {
    const [c, s] = sel.split(':');
    // Exact focus match
    if (cat === c && sub === s) return true;
    // Parent-level "All" post under the same growth path
    if (cat === c && !sub) return true;
    if (rawCat === sel) return true;
    return false;
  }

  if (cat === sel) return true;
  if (sub && `${cat}:${sub}`.startsWith(`${sel}:`)) return true;
  if (rawCat.startsWith(`${sel}:`)) return true;
  return false;
}
