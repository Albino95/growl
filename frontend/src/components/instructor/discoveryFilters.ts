import type { DiscoverInstructor } from '../../services/api/instructor';

export type DiscoveryFilter = 'all' | 'paths' | 'top' | 'new' | 'open';

export const DISCOVERY_FILTERS: { key: DiscoveryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paths', label: 'My paths' },
  { key: 'open', label: 'Taking clients' },
  { key: 'top', label: 'Top rated' },
  { key: 'new', label: 'New' },
];

/** "New" coach: no completed plans and no reviews yet. */
export function isNewCoach(p: DiscoverInstructor): boolean {
  return (p.completed_plans ?? 0) === 0 && (p.rating_count ?? 0) === 0;
}

/**
 * Client-side refinement of the server-ranked list. 'paths' is applied server-side
 * (for_paths=1) and here only re-checks shared paths. Paused coaches sink to the end
 * of every view so "Reach out" is rarely a dead end.
 */
export function applyDiscoveryFilter(
  items: DiscoverInstructor[],
  filter: DiscoveryFilter
): DiscoverInstructor[] {
  let out = items.slice();
  if (filter === 'paths') out = out.filter((p) => (p.shared_categories || []).length > 0);
  if (filter === 'open') out = out.filter((p) => p.accepting !== false);
  if (filter === 'new') out = out.filter(isNewCoach);
  if (filter === 'top') {
    out = out
      .filter((p) => (p.rating_count ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0)
      );
  }
  // Stable: keep server order within each group.
  const open = out.filter((p) => p.accepting !== false);
  const paused = out.filter((p) => p.accepting === false);
  return [...open, ...paused];
}
