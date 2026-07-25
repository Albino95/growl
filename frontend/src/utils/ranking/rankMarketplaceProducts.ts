import {
  categoryScore,
  expandUserCategoryKeys,
  jitter,
  recencyScore,
} from './scores';

export type RankableProduct = {
  id: string;
  category: string;
  subcategory?: string | null;
  created_at: string;
  stock: number;
  price: number;
};

export type RankedProduct<T extends RankableProduct> = T & {
  relevanceScore: number;
  matchLabel: string | null;
  isNew: boolean;
};

export type RankMarketplaceOptions = {
  nowMs?: number;
  userPoints?: number;
  journalTags?: string[];
  purchasedCategories?: string[];
};

export function rankMarketplaceProducts<T extends RankableProduct>(
  products: T[],
  userPaths: string[],
  options: RankMarketplaceOptions = {}
): RankedProduct<T>[] {
  const nowMs = options.nowMs ?? Date.now();
  const keys = expandUserCategoryKeys(userPaths);
  const journalTags = new Set((options.journalTags || []).map((t) => t.toLowerCase()));
  const purchased = new Set((options.purchasedCategories || []).map((c) => c.toLowerCase()));
  const userPoints = options.userPoints ?? 0;

  return products
    .map((product) => {
      let score =
        categoryScore(keys, product.category, product.subcategory) +
        recencyScore(product.created_at, nowMs) * 0.35 +
        Math.min(14, product.stock > 0 ? 10 : 0) +
        jitter(product.id) * 6;

      if (userPoints > 100) score += 6;

      const cat = product.category.toLowerCase();
      const sub = (product.subcategory || '').toLowerCase();
      for (const tag of journalTags) {
        if (tag.includes(cat) || (sub && tag.includes(sub))) score += 18;
      }
      if (purchased.has(cat)) score += 12;

      const hours = (nowMs - new Date(product.created_at).getTime()) / (1000 * 60 * 60);
      const isNew = !Number.isNaN(hours) && hours < 72;

      let matchLabel: string | null = null;
      if (keys.has(`${cat}:${sub}`) || (sub && keys.has(`${cat}:${sub}`))) {
        matchLabel = sub ? `Matches your ${sub.replace(/-/g, ' ')} path` : null;
      } else if (keys.has(cat)) {
        matchLabel = `Matches your ${cat} journey`;
      }

      return {
        ...product,
        relevanceScore: score,
        matchLabel,
        isNew,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
