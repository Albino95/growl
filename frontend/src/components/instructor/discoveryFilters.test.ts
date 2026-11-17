import { describe, it, expect } from 'vitest';
import { applyDiscoveryFilter, isNewCoach } from './discoveryFilters';
import type { DiscoverInstructor } from '../../services/api/instructor';

const p = (id: string, x: Partial<DiscoverInstructor> = {}) =>
  ({
    id,
    username: id,
    points: 0,
    vote_count: 0,
    categories: [],
    shared_categories: [],
    created_at: '',
    accepting: true,
    completed_plans: 0,
    rating_avg: null,
    rating_count: 0,
    ...x,
  }) as DiscoverInstructor;

const list = [
  p('a', { rating_avg: 4.2, rating_count: 3, completed_plans: 2, shared_categories: ['fitness'] }),
  p('b', { accepting: false }),
  p('c', { rating_avg: 4.9, rating_count: 1, completed_plans: 1 }),
  p('d'),
];

describe('applyDiscoveryFilter', () => {
  it('all: keeps order but sinks paused coaches', () => {
    expect(applyDiscoveryFilter(list, 'all').map((x) => x.id)).toEqual(['a', 'c', 'd', 'b']);
  });
  it('open: only coaches taking clients', () => {
    expect(applyDiscoveryFilter(list, 'open').map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });
  it('top: rated only, best first', () => {
    expect(applyDiscoveryFilter(list, 'top').map((x) => x.id)).toEqual(['c', 'a']);
  });
  it('new: no plans and no reviews', () => {
    expect(applyDiscoveryFilter(list, 'new').map((x) => x.id)).toEqual(['d', 'b']);
    expect(isNewCoach(list[0])).toBe(false);
  });
  it('paths: shared path only', () => {
    expect(applyDiscoveryFilter(list, 'paths').map((x) => x.id)).toEqual(['a']);
  });
});
