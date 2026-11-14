import type { Env } from '../types';

export const INSTRUCTOR_ENDORSEMENTS_REQUIRED = 5;
export const INSTRUCTOR_MIN_POSTS_TO_CLAIM = 3;

export type InstructorEligibility = {
  alreadyInstructor: boolean;
  endorsementsReceived: number;
  endorsementsNeeded: number;
  postCount: number;
  postsNeeded: number;
  eligible: boolean;
  canClaim: boolean;
};

/** Parse categories array from users.metadata JSON. */
export function parseUserCategories(metadataJson: string | null | undefined): string[] {
  try {
    const meta = JSON.parse(metadataJson || '{}');
    return Array.isArray(meta.categories)
      ? meta.categories.filter((c: unknown) => typeof c === 'string' && String(c).trim())
      : [];
  } catch {
    return [];
  }
}

/**
 * Metadata paths first; if empty, infer from published posts so Home faces
 * never look pathless when their feed cards already sit on a growth path.
 */
export async function resolveUserCategories(
  env: Env,
  userId: string,
  metadataJson?: string | null
): Promise<string[]> {
  let cats = parseUserCategories(metadataJson);
  if (cats.length > 0) return cats;

  if (metadataJson == null) {
    const row = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(userId)
      .first<{ metadata: string }>();
    cats = parseUserCategories(row?.metadata);
    if (cats.length > 0) return cats;
  }

  const catRows = await env.DB.prepare(
    `SELECT DISTINCT category AS c FROM posts
     WHERE user_id = ? AND category IS NOT NULL AND trim(category) != ''
     UNION
     SELECT DISTINCT
       CASE
         WHEN subcategory IS NOT NULL AND trim(subcategory) != '' AND instr(subcategory, ':') > 0
           THEN subcategory
         WHEN subcategory IS NOT NULL AND trim(subcategory) != '' AND category IS NOT NULL
           THEN category || ':' || subcategory
         ELSE NULL
       END AS c
     FROM posts
     WHERE user_id = ?
     LIMIT 24`
  )
    .bind(userId, userId)
    .all<{ c: string | null }>();

  return [
    ...new Set(
      (catRows.results || [])
        .map((r) => (r.c ? String(r.c).trim() : ''))
        .filter(Boolean)
    ),
  ];
}

/**
 * Shared path = exact match, or same parent key (e.g. fitness:cardio overlaps fitness).
 */
export function categoriesOverlap(a: string[], b: string[]): string[] {
  const shared: string[] = [];
  for (const pathA of a) {
    const parentA = pathA.includes(':') ? pathA.split(':')[0] : pathA;
    for (const pathB of b) {
      const parentB = pathB.includes(':') ? pathB.split(':')[0] : pathB;
      if (pathA === pathB || parentA === parentB) {
        const token = pathA === pathB ? pathA : parentA;
        if (!shared.includes(token)) shared.push(token);
      }
    }
  }
  return shared;
}

export async function countEndorsements(env: Env, candidateId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM instructor_votes WHERE candidate_id = ?'
  )
    .bind(candidateId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function countUserPosts(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function computeEligibility(
  env: Env,
  userId: string,
  isInstructor: boolean | number
): Promise<InstructorEligibility> {
  const alreadyInstructor = !!isInstructor;
  const endorsementsReceived = await countEndorsements(env, userId);
  const postCount = await countUserPosts(env, userId);
  const eligible =
    !alreadyInstructor &&
    endorsementsReceived >= INSTRUCTOR_ENDORSEMENTS_REQUIRED &&
    postCount >= INSTRUCTOR_MIN_POSTS_TO_CLAIM;

  return {
    alreadyInstructor,
    endorsementsReceived,
    endorsementsNeeded: INSTRUCTOR_ENDORSEMENTS_REQUIRED,
    postCount,
    postsNeeded: INSTRUCTOR_MIN_POSTS_TO_CLAIM,
    eligible,
    canClaim: eligible,
  };
}
