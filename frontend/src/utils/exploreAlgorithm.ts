/**
 * @deprecated Import from `utils/ranking` instead. Re-exports for backward compatibility.
 */
export {
  expandUserCategoryKeys,
  categoryScore,
  recencyScore,
  engagementScore,
  jitter,
} from './ranking/scores';

export {
  rankExploreRows,
  type ExploreAlgorithmPost,
  type ExploreAlgorithmProduct,
  type ExploreRankedRow,
  type RankExploreOptions,
} from './ranking/rankExploreRows';
