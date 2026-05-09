import { describe, it, expect } from 'vitest';
import { cohortsOverlap, expandCohortKeys } from '../../src/routes/friends';

describe('friends cohort helpers', () => {
  it('expandCohortKeys adds parent segment', () => {
    const k = expandCohortKeys(['art:piano']);
    expect(k.has('art:piano')).toBe(true);
    expect(k.has('art')).toBe(true);
  });

  it('cohortsOverlap on exact path', () => {
    expect(cohortsOverlap(['art:piano'], ['art:piano'])).toBe(true);
  });

  it('cohortsOverlap when sharing parent category', () => {
    expect(cohortsOverlap(['art:piano'], ['art:guitar'])).toBe(true);
  });

  it('no overlap for disjoint categories', () => {
    expect(cohortsOverlap(['fitness:cardio'], ['mindset:meditation'])).toBe(false);
  });

  it('trim and lowercase', () => {
    expect(cohortsOverlap(['  ART:Piano  '], ['art:piano'])).toBe(true);
  });
});
