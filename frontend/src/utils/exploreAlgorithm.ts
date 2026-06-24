/**
 * Explore ranking (pure functions — safe to unit test).
 *
 * ## How scoring works (read this first)
 *
 * For each **post** we compute:
 *
 * ```
 * score = categoryMatch + recencyBoost + engagementBoost + friendSignals + jitter
 * ```
 *
 * - **categoryMatch** — Expand onboarding paths (`["art:violin","fitness"]` → keys `art`, `art:violin`,
 *   `fitness`). Compare to each item’s `category` / `category:subcategory`.
 * - **recencyBoost** — Newer posts score higher (see `recencyScore`).
 * - **engagementBoost** — Likes + comments, capped.
 * - **friendSignals** — Boost when the author is in `friendIds`, and when `metadata.friend_likes_count`
 *   shows friends engaged with the post.
 * - **jitter** — Stable tie-break from id hash.
 *
 * **Products** use similar category/recency ideas but scores are multiplied by `productScoreMultiplier`
 * (defaults below 1) so Explore stays **post-first** unless you load products-only elsewhere.
 *
 * ### Limitations (v1)
 *
 * No “already seen” penalty, no MMR diversity — see docs/EXPLORE_ALGORITHM.md.
 */

/** Inputs mirror feed/marketplace payloads enough for ranking */
export type ExploreAlgorithmPost = {
  id: string;
  user_id?: string;
  category: string;
  subcategory?: string | null;
  created_at: string;
  metadata?: { likes?: number; comments?: number; friend_likes_count?: number };
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

export type RankExploreOptions = {
  nowMs?: number;
  /** Viewer’s friend user ids — boosts posts authored by friends. */
  friendIds?: Set<string>;
  /** Multiply final product scores (default 0.45 keeps Explore post-heavy). */
  productScoreMultiplier?: number;
};

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
>(posts: P[], products: Pr[], userPaths: string[], options: RankExploreOptions = {}): ExploreRankedRow<P, Pr>[] {
  const nowMs = options.nowMs ?? Date.now();
  const friendIds = options.friendIds ?? new Set<string>();
  const productMul = options.productScoreMultiplier ?? 0.45;

  const keys = expandUserCategoryKeys(userPaths);
  const rows: ExploreRankedRow<P, Pr>[] = [];

  for (const p of posts) {
    const likes = p.metadata?.likes ?? 0;
    const comments = p.metadata?.comments ?? 0;
    const friendLikes = p.metadata?.friend_likes_count ?? 0;
    const friendAuthorBoost = p.user_id && friendIds.has(p.user_id) ? 30 : 0;
    const friendEngagementBoost = Math.min(26, friendLikes * 8);
    const score =
      categoryScore(keys, p.category, p.subcategory) +
      recencyScore(p.created_at, nowMs) * 0.65 +
      Math.min(42, (likes + comments) * 1.25) +
      friendAuthorBoost +
      friendEngagementBoost +
      jitter(p.id) * 8;
    rows.push({ kind: 'post', post: p, score });
  }

  for (const pr of products) {
    let score =
      categoryScore(keys, pr.category, pr.subcategory) * 0.82 +
      recencyScore(pr.created_at, nowMs) * 0.35 +
      Math.min(14, pr.stock > 0 ? 8 : 0) +
      jitter(pr.id) * 6;
    score *= productMul;
    rows.push({ kind: 'product', product: pr, score });
  }

  return rows.sort((a, b) => b.score - a.score);
}
