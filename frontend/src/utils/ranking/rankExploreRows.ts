import {
  categoryScore,
  engagementScore,
  expandUserCategoryKeys,
  jitter,
  recencyScore,
} from './scores';
import { applyPerAuthorCap } from './diversity';

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
  friendIds?: Set<string>;
  productScoreMultiplier?: number;
  applyDiversity?: boolean;
};

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
      recencyScore(p.created_at, nowMs) * 0.85 +
      engagementScore(likes, comments) +
      friendAuthorBoost +
      friendEngagementBoost +
      jitter(p.id) * 6;
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

  const sorted = rows.sort((a, b) => b.score - a.score);

  if (!options.applyDiversity) return sorted;

  const postRows = sorted.filter((r): r is ExploreRankedRow<P, Pr> & { kind: 'post' } => r.kind === 'post');
  const productRows = sorted.filter((r): r is ExploreRankedRow<P, Pr> & { kind: 'product' } => r.kind === 'product');
  const diversePosts = applyPerAuthorCap(postRows, (r) => r.post.user_id, 2, 30);
  return [...diversePosts, ...productRows].sort((a, b) => b.score - a.score);
}
