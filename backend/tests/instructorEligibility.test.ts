import { describe, expect, it } from 'vitest';
import {
  categoriesOverlap,
  INSTRUCTOR_ENDORSEMENTS_REQUIRED,
  INSTRUCTOR_MIN_POSTS_TO_CLAIM,
  parseUserCategories,
} from '../src/utils/instructorEligibility';

describe('instructorEligibility', () => {
  it('parses categories from metadata JSON', () => {
    expect(parseUserCategories('{"categories":["fitness:cardio","art"]}')).toEqual([
      'fitness:cardio',
      'art',
    ]);
    expect(parseUserCategories('{}')).toEqual([]);
    expect(parseUserCategories(null)).toEqual([]);
  });

  it('detects exact and parent-prefix category overlap', () => {
    expect(categoriesOverlap(['fitness:cardio'], ['fitness:cardio'])).toContain('fitness:cardio');
    expect(categoriesOverlap(['fitness:cardio'], ['fitness:strength']).length).toBeGreaterThan(0);
    expect(categoriesOverlap(['fitness'], ['fitness:cardio']).length).toBeGreaterThan(0);
    expect(categoriesOverlap(['art:piano'], ['nutrition:cooking'])).toEqual([]);
  });

  it('exports claim thresholds', () => {
    expect(INSTRUCTOR_ENDORSEMENTS_REQUIRED).toBe(5);
    expect(INSTRUCTOR_MIN_POSTS_TO_CLAIM).toBe(3);
  });
});
