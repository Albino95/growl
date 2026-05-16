/**
 * Explore ranking (pure functions — safe to unit test).
 *
 * ## How scoring works (read this first)
 *
 * For each **post** we compute:
 *
 * ```
 * score = categoryMatch + recencyBoost + engagementBoost + jitter
 * ```
 *
 * - **categoryMatch** — Expand your onboarding paths (`["art:violin","fitness"]` → keys `art`, `art:violin`,
 *   `fitness`). Compare to each item’s `category` / `category:subcategory`. Exact subcategory path wins most;
 *   parent category only wins less; fuzzy prefix adds a small tie-break.
 * - **recencyBoost** — `max(0, 48 - ageHours) * weight`. Newer content scores higher; fades linearly over ~2 days.
 * - **engagementBoost** — `min(cap, (likes + comments) * multiplier)` so viral-ish posts rise slightly without domination.
 * - **jitter** — Tiny deterministic hash from id so tie-breaks stay stable between renders (not crypto random).
 *
 * **Products** use the same category + recency ideas but tuned down on recency and add a small “in stock” nudge.
 *
 * Finally we **sort descending by score** and interleave post/product kinds naturally by score alone.
 *
 * ### Limitations (v1)
 *
 * No friend boost, no “already seen” penalty, no MMR diversity — see docs/EXPLORE_ALGORITHM.md for roadmap notes.
 */

/** Inputs mirror feed/marketplace payloads enough for ranking */
export type ExploreAlgorithmPost = {
  id: string;
  category: string;
  subcategory?: string | null;
  created_at: string;
  metadata?: { likes?: number; comments?: number };
};

export type ExploreAlgorithmProduct = {
  id: string;
  category: string;
  subcategory?: string | null;
  created_at: string;
  stock: number;
};

export type ExploreRankedRow<
  P extends ExploreAlgorithmPost = ExploreAlgorithmPost,
  Pr extends ExploreAlgorithmProduct = ExploreAlgorithmProduct,
> =
  | { kind: 'post'; post: P; score: number }
  | { kind: 'product'; product: Pr; score: number };

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

export function categoryScore(userKeys: Set<string>, category: string, sub?: string | null): number {
  const c = category.toLowerCase();
  const subKey = sub ? `${c}:${String(sub).toLowerCase()}` : '';
  let score = 0;
  if (userKeys.has(c)) score += 35;
  if (subKey && userKeys.has(subKey)) score += 55;
  for (const k of userKeys) {
    if (k.includes(':')) continue;
    if (c.startsWith(k) || k.startsWith(c)) score += 12;
  }
  return score;
}

/** Higher when created_at is recent; roughly “fresh within ~48h” wins most points */
export function recencyScore(iso: string, nowMs: number = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  const hours = (nowMs - t) / (1000 * 60 * 60);
  return Math.max(0, 48 - hours);
}

export function jitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % 100) / 100;
}

export function rankExploreRows<
  P extends ExploreAlgorithmPost,
  Pr extends ExploreAlgorithmProduct,
>(posts: P[], products: Pr[], userPaths: string[], nowMs: number = Date.now()): ExploreRankedRow<P, Pr>[] {
  const keys = expandUserCategoryKeys(userPaths);
  const rows: ExploreRankedRow<P, Pr>[] = [];

  for (const p of posts) {
    const likes = p.metadata?.likes ?? 0;
    const comments = p.metadata?.comments ?? 0;
    const score =
      categoryScore(keys, p.category, p.subcategory) +
      recencyScore(p.created_at, nowMs) * 0.6 +
      Math.min(40, (likes + comments) * 1.2) +
      jitter(p.id) * 8;
    rows.push({ kind: 'post', post: p, score });
  }

  for (const pr of products) {
    const score =
      categoryScore(keys, pr.category, pr.subcategory) * 0.85 +
      recencyScore(pr.created_at, nowMs) * 0.35 +
      Math.min(15, pr.stock > 0 ? 8 : 0) +
      jitter(pr.id) * 6;
    rows.push({ kind: 'product', product: pr, score });
  }

  return rows.sort((a, b) => b.score - a.score);
}
