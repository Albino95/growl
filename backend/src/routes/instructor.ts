import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import {
  categoriesOverlap,
  computeEligibility,
  countEndorsements,
  countUserPosts,
  parseUserCategories,
} from '../utils/instructorEligibility';
import { POINTS, awardPoints } from '../utils/points';
import { validateRequest, updatePartnershipRequestSchema, updatePartnershipSchema } from '../utils/validation';
import { areFriends } from './friends';

type AuthInstructor = { userId: string; user: NonNullable<Awaited<ReturnType<typeof getRequestContext>>['user']> };

async function requireInstructor(
  request: Request,
  env: Env
): Promise<AuthInstructor | Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!ctx.user.is_instructor) {
    return error('FORBIDDEN', 'Instructor access required', 403);
  }
  return { userId: ctx.userId, user: ctx.user };
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * GET /api/v1/instructor/instructors
 * Get list of instructors
 */
export async function getInstructors(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  try {
    const instructors = await env.DB.prepare(
      `SELECT 
        u.id,
        u.email,
        u.points,
        u.metadata,
        u.is_instructor,
        u.created_at,
        COUNT(DISTINCT iv.id) as vote_count
      FROM users u
      LEFT JOIN instructor_votes iv ON u.id = iv.candidate_id
      WHERE u.is_instructor = 1
      GROUP BY u.id
      ORDER BY vote_count DESC, u.points DESC
      LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all<{
        id: string;
        email: string;
        points: number;
        metadata: string;
        is_instructor: boolean;
        created_at: string;
        vote_count: number;
      }>();

    const formattedInstructors = instructors.results.map((instructor) => {
      const metadata = JSON.parse(instructor.metadata || '{}');
      return {
        id: instructor.id,
        username: metadata.username,
        avatar: metadata.avatar,
        points: instructor.points,
        vote_count: instructor.vote_count || 0,
        categories: metadata.categories || [],
        created_at: instructor.created_at,
      };
    });

    return json({
      instructors: formattedInstructors,
      total: formattedInstructors.length,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('[getInstructors] Error:', err);
    const errorMessage = err?.message || 'Failed to fetch instructors';
    if (errorMessage.includes('no such table')) {
      return error('DATABASE_ERROR', 'Database tables not initialized. Please run migrations.', 500);
    }
    return error('DATABASE_ERROR', errorMessage, 500);
  }
}

/**
 * GET /api/v1/instructor/instructors/:id
 * Get a specific instructor
 */
export async function getInstructor(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  try {
    const instructor = await env.DB.prepare(
      `SELECT 
        u.*,
        COUNT(DISTINCT iv.id) as vote_count,
        COUNT(DISTINCT p.id) as post_count
      FROM users u
      LEFT JOIN instructor_votes iv ON u.id = iv.candidate_id
      LEFT JOIN posts p ON u.id = p.user_id
      WHERE u.id = ? AND u.is_instructor = 1
      GROUP BY u.id`
    )
      .bind(instructorId)
      .first<{
        id: string;
        email: string;
        points: number;
        metadata: string;
        is_instructor: boolean;
        created_at: string;
        vote_count: number;
        post_count: number;
      }>();

    if (!instructor) {
      return error('INSTRUCTOR_NOT_FOUND', 'Instructor not found', 404);
    }

    const metadata = JSON.parse(instructor.metadata || '{}');

    return json({
      id: instructor.id,
      username: metadata.username,
      avatar: metadata.avatar,
      points: instructor.points,
      vote_count: instructor.vote_count || 0,
      post_count: instructor.post_count || 0,
      categories: metadata.categories || [],
      created_at: instructor.created_at,
    });
  } catch (err) {
    console.error('[getInstructor] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch instructor', 500);
  }
}

/**
 * POST /api/v1/instructor/instructors/:id/vote
 * Endorse a candidate (peer endorsement). Works for non-instructors.
 */
export async function voteInstructor(
  request: Request,
  env: Env,
  candidateId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (ctx.userId === candidateId) {
    return error('INVALID_ENDORSEMENT', 'You cannot endorse yourself', 400);
  }

  const candidate = await env.DB.prepare('SELECT id, metadata FROM users WHERE id = ?')
    .bind(candidateId)
    .first<{ id: string; metadata: string }>();

  if (!candidate) {
    return error('USER_NOT_FOUND', 'User not found', 404);
  }

  const voterMeta = ctx.user?.metadata ?? '{}';
  const voterCats = parseUserCategories(voterMeta);
  const candidateCats = parseUserCategories(candidate.metadata);
  const shared = categoriesOverlap(voterCats, candidateCats);

  if (shared.length === 0) {
    return error(
      'NO_CATEGORY_OVERLAP',
      'You can only endorse people who share a growth category with you',
      400
    );
  }

  const existingVote = await env.DB.prepare(
    'SELECT id FROM instructor_votes WHERE user_id = ? AND candidate_id = ?'
  )
    .bind(ctx.userId, candidateId)
    .first();

  if (existingVote) {
    return error('ALREADY_VOTED', 'You have already endorsed this person', 400);
  }

  try {
    const voteId = generateId('vote');
    await env.DB.prepare(
      'INSERT INTO instructor_votes (id, user_id, candidate_id, created_at) VALUES (?, ?, ?, datetime("now"))'
    )
      .bind(voteId, ctx.userId, candidateId)
      .run();

    const candidatePoints = await awardPoints(env, candidateId, POINTS.RECEIVE_ENDORSEMENT);
    const voterPoints = await awardPoints(env, ctx.userId, POINTS.GIVE_ENDORSEMENT);

    const endorsementCount = await countEndorsements(env, candidateId);

    return json(
      {
        message: 'Endorsement recorded',
        endorsed: true,
        sharedCategories: shared,
        endorsementCount,
        points_awarded_candidate: POINTS.RECEIVE_ENDORSEMENT,
        points_total_candidate: candidatePoints ?? undefined,
        points_awarded_voter: POINTS.GIVE_ENDORSEMENT,
        points_total_voter: voterPoints ?? undefined,
      },
      201
    );
  } catch (err) {
    console.error('[voteInstructor] Error:', err);
    return error('DATABASE_ERROR', 'Failed to record endorsement', 500);
  }
}

/**
 * GET /api/v1/instructor/eligibility
 */
export async function getEligibility(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const eligibility = await computeEligibility(env, ctx.userId, ctx.user.is_instructor);
    return json(eligibility);
  } catch (err) {
    console.error('[getEligibility]', err);
    return error('DATABASE_ERROR', 'Failed to load eligibility', 500);
  }
}

/**
 * POST /api/v1/instructor/claim
 */
export async function claimInstructor(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    if (ctx.user.is_instructor) {
      const eligibility = await computeEligibility(env, ctx.userId, 1);
      return json({
        ...eligibility,
        claimed: true,
        message: 'Already an instructor',
      });
    }

    const eligibility = await computeEligibility(env, ctx.userId, 0);
    if (!eligibility.canClaim) {
      return error(
        'NOT_ELIGIBLE',
        `Need ${eligibility.endorsementsNeeded} endorsements and ${eligibility.postsNeeded} posts to claim`,
        400
      );
    }

    const user = await env.DB.prepare('SELECT metadata FROM users WHERE id = ?')
      .bind(ctx.userId)
      .first<{ metadata: string }>();
    const meta = JSON.parse(user?.metadata || '{}');
    meta.instructor_claimed_at = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE users SET is_instructor = 1, metadata = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(JSON.stringify(meta), ctx.userId)
      .run();

    const pointsTotal = await awardPoints(env, ctx.userId, POINTS.CLAIM_INSTRUCTOR);

    const updated = await computeEligibility(env, ctx.userId, 1);
    return json({
      ...updated,
      claimed: true,
      message: 'You are now an instructor',
      points_awarded: POINTS.CLAIM_INSTRUCTOR,
      points_total: pointsTotal ?? undefined,
    });
  } catch (err) {
    console.error('[claimInstructor]', err);
    return error('DATABASE_ERROR', 'Failed to claim instructor status', 500);
  }
}

/**
 * GET /api/v1/instructor/candidates/:userId/endorsement-status
 */
export async function getEndorsementStatus(
  request: Request,
  env: Env,
  candidateId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const candidate = await env.DB.prepare('SELECT id, metadata, is_instructor FROM users WHERE id = ?')
      .bind(candidateId)
      .first<{ id: string; metadata: string; is_instructor: number }>();

    if (!candidate) {
      return error('USER_NOT_FOUND', 'User not found', 404);
    }

    const voterCats = parseUserCategories(ctx.user?.metadata);
    const candidateCats = parseUserCategories(candidate.metadata);
    const sharedCategories = categoriesOverlap(voterCats, candidateCats);
    const isSelf = ctx.userId === candidateId;

    const existingVote = await env.DB.prepare(
      'SELECT id FROM instructor_votes WHERE user_id = ? AND candidate_id = ?'
    )
      .bind(ctx.userId, candidateId)
      .first();

    const alreadyEndorsed = !!existingVote;
    const endorsementCount = await countEndorsements(env, candidateId);
    const canEndorse = !isSelf && !alreadyEndorsed && sharedCategories.length > 0;

    return json({
      canEndorse,
      alreadyEndorsed,
      sharedCategories,
      endorsementCount,
      isSelf,
      isInstructor: !!candidate.is_instructor,
    });
  } catch (err) {
    console.error('[getEndorsementStatus]', err);
    return error('DATABASE_ERROR', 'Failed to load endorsement status', 500);
  }
}

/**
 * GET /api/v1/instructor/instructors/:id/students
 * Returns people who endorsed this instructor (self only).
 */
export async function getInstructorStudents(
  request: Request,
  env: Env,
  instructorId: string
): Promise<Response> {
  const auth = await requireInstructor(request, env);
  if (auth instanceof Response) return auth;
  if (auth.userId !== instructorId) {
    return error('FORBIDDEN', 'You can only view your own endorsers', 403);
  }

  try {
    const endorsers = await loadEndorsers(env, instructorId);
    return json({ students: endorsers, endorsers });
  } catch (err) {
    console.error('[getInstructorStudents] Error:', err);
    return error('DATABASE_ERROR', 'Failed to fetch endorsers', 500);
  }
}

async function loadEndorsers(env: Env, instructorId: string) {
  const rows = await env.DB.prepare(
    `SELECT
      u.id,
      u.metadata,
      u.points,
      iv.created_at AS endorsed_at
    FROM instructor_votes iv
    JOIN users u ON iv.user_id = u.id
    WHERE iv.candidate_id = ?
    ORDER BY iv.created_at DESC
    LIMIT 100`
  )
    .bind(instructorId)
    .all<{
      id: string;
      metadata: string;
      points: number;
      endorsed_at: string;
    }>();

  return Promise.all(
    (rows.results || []).map(async (row) => {
      const metadata = parseMeta(row.metadata);
      const categories = Array.isArray(metadata.categories)
        ? (metadata.categories as string[])
        : [];
      return {
        id: row.id,
        username: (metadata.username as string) || 'Member',
        avatar: (metadata.avatar as string) || null,
        points: row.points,
        categories,
        endorsed_at: row.endorsed_at,
        is_friend: await areFriends(env, instructorId, row.id),
      };
    })
  );
}

/**
 * GET /api/v1/instructor/hub
 * Dashboard for claimed instructors: reputation, endorsers, partnerships, referrals.
 */
export async function getInstructorHub(request: Request, env: Env): Promise<Response> {
  const auth = await requireInstructor(request, env);
  if (auth instanceof Response) return auth;

  try {
    const [endorsements, postCount, endorsers, pendingReqs, partnerships, referral] =
      await Promise.all([
        countEndorsements(env, auth.userId),
        countUserPosts(env, auth.userId),
        loadEndorsers(env, auth.userId),
        env.DB.prepare(
          `SELECT
            r.id,
            r.business_id,
            r.status,
            r.partnership_type,
            r.commission_rate,
            r.fixed_fee,
            r.message,
            r.created_at,
            u.metadata AS business_metadata,
            bs.business_name
          FROM partnership_requests r
          JOIN users u ON u.id = r.business_id
          LEFT JOIN business_settings bs ON bs.business_id = r.business_id
          WHERE r.instructor_id = ? AND r.status = 'pending'
          ORDER BY r.created_at DESC`
        )
          .bind(auth.userId)
          .all<{
            id: string;
            business_id: string;
            status: string;
            partnership_type: string;
            commission_rate: number | null;
            fixed_fee: number | null;
            message: string | null;
            created_at: string;
            business_metadata: string;
            business_name: string | null;
          }>(),
        env.DB.prepare(
          `SELECT
            p.id,
            p.business_id,
            p.partnership_type,
            p.commission_rate,
            p.fixed_fee,
            p.status,
            p.created_at,
            p.updated_at,
            u.metadata AS business_metadata,
            bs.business_name,
            COALESCE((
              SELECT SUM(o.total)
              FROM orders o
              WHERE o.business_id = p.business_id
                AND o.source = 'partnership'
                AND json_extract(o.metadata, '$.referral_instructor_id') = p.instructor_id
                AND o.status IN ('completed', 'delivered')
            ), 0) AS attributed_revenue,
            COALESCE((
              SELECT COUNT(*)
              FROM orders o
              WHERE o.business_id = p.business_id
                AND o.source = 'partnership'
                AND json_extract(o.metadata, '$.referral_instructor_id') = p.instructor_id
                AND o.status IN ('completed', 'delivered')
            ), 0) AS attributed_orders
          FROM partnerships p
          JOIN users u ON u.id = p.business_id
          LEFT JOIN business_settings bs ON bs.business_id = p.business_id
          WHERE p.instructor_id = ?
          ORDER BY
            CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
            p.updated_at DESC`
        )
          .bind(auth.userId)
          .all<{
            id: string;
            business_id: string;
            partnership_type: string;
            commission_rate: number | null;
            fixed_fee: number | null;
            status: string;
            created_at: string;
            updated_at: string;
            business_metadata: string;
            business_name: string | null;
            attributed_revenue: number;
            attributed_orders: number;
          }>(),
        env.DB.prepare(
          `SELECT
            COALESCE(SUM(total), 0) AS revenue,
            COUNT(*) AS order_count
          FROM orders
          WHERE json_extract(metadata, '$.referral_instructor_id') = ?
            AND status IN ('completed', 'delivered')`
        )
          .bind(auth.userId)
          .first<{ revenue: number; order_count: number }>(),
      ]);

    const formatBusiness = (metaRaw: string, businessName: string | null) => {
      const meta = parseMeta(metaRaw);
      return {
        name: businessName || (meta.username as string) || 'Business',
        avatar: (meta.avatar as string) || null,
      };
    };

    const pending_requests = (pendingReqs.results || []).map((r) => {
      const biz = formatBusiness(r.business_metadata, r.business_name);
      return {
        id: r.id,
        business_id: r.business_id,
        business_name: biz.name,
        business_avatar: biz.avatar,
        partnership_type: r.partnership_type,
        commission_rate: r.commission_rate,
        fixed_fee: r.fixed_fee,
        message: r.message,
        created_at: r.created_at,
      };
    });

    const activePartnerships = (partnerships.results || []).map((p) => {
      const biz = formatBusiness(p.business_metadata, p.business_name);
      return {
        id: p.id,
        business_id: p.business_id,
        business_name: biz.name,
        business_avatar: biz.avatar,
        partnership_type: p.partnership_type,
        commission_rate: p.commission_rate,
        fixed_fee: p.fixed_fee,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        attributed_revenue: Number(p.attributed_revenue) || 0,
        attributed_orders: Number(p.attributed_orders) || 0,
      };
    });

    return json({
      stats: {
        points: Number(auth.user.points) || 0,
        endorsements,
        posts: postCount,
        endorsers: endorsers.length,
        pending_requests: pending_requests.length,
        active_partnerships: activePartnerships.filter((p) => p.status === 'active').length,
        referral_revenue: Number(referral?.revenue) || 0,
        referral_orders: Number(referral?.order_count) || 0,
      },
      endorsers,
      pending_requests,
      partnerships: activePartnerships,
    });
  } catch (err) {
    console.error('[getInstructorHub] Error:', err);
    return error('DATABASE_ERROR', 'Failed to load instructor hub', 500);
  }
}

/**
 * PATCH /api/v1/instructor/partnerships/requests/:id
 * Instructor accepts or declines a business partnership request.
 */
export async function respondToPartnershipRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const auth = await requireInstructor(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, updatePartnershipRequestSchema);
  if (!validation.success) return validation.response;
  const { status } = validation.data;

  try {
    const req = await env.DB.prepare(
      `SELECT * FROM partnership_requests WHERE id = ? AND instructor_id = ? LIMIT 1`
    )
      .bind(requestId, auth.userId)
      .first<{
        id: string;
        business_id: string;
        instructor_id: string;
        status: string;
        partnership_type: 'commission' | 'fixed' | 'hybrid';
        commission_rate: number | null;
        fixed_fee: number | null;
      }>();

    if (!req) return error('NOT_FOUND', 'Partnership request not found', 404);
    if (req.status !== 'pending') {
      return error('VALIDATION_ERROR', 'Request is no longer pending', 400);
    }

    await env.DB.prepare(
      `UPDATE partnership_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, requestId)
      .run();

    if (status === 'approved') {
      await env.DB.prepare(
        `INSERT INTO partnerships
        (id, business_id, instructor_id, partnership_type, commission_rate, fixed_fee, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
        ON CONFLICT(business_id, instructor_id)
        DO UPDATE SET partnership_type = excluded.partnership_type,
          commission_rate = excluded.commission_rate, fixed_fee = excluded.fixed_fee,
          status = 'active', updated_at = datetime('now')`
      )
        .bind(
          generateId('partner'),
          req.business_id,
          req.instructor_id,
          req.partnership_type,
          req.commission_rate,
          req.fixed_fee
        )
        .run();
    }

    return json({ ok: true, status });
  } catch (err) {
    console.error('[respondToPartnershipRequest] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update partnership request', 500);
  }
}

/**
 * PATCH /api/v1/instructor/partnerships/:id
 * Instructor pauses or ends an active partnership.
 */
export async function updateInstructorPartnership(
  request: Request,
  env: Env,
  partnershipId: string
): Promise<Response> {
  const auth = await requireInstructor(request, env);
  if (auth instanceof Response) return auth;

  const validation = await validateRequest(request, updatePartnershipSchema);
  if (!validation.success) return validation.response;
  const { status } = validation.data;

  try {
    const row = await env.DB.prepare(
      `SELECT id FROM partnerships WHERE id = ? AND instructor_id = ?`
    )
      .bind(partnershipId, auth.userId)
      .first<{ id: string }>();

    if (!row) return error('NOT_FOUND', 'Partnership not found', 404);

    await env.DB.prepare(
      `UPDATE partnerships SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, partnershipId)
      .run();

    return json({ ok: true, status });
  } catch (err) {
    console.error('[updateInstructorPartnership] Error:', err);
    return error('DATABASE_ERROR', 'Failed to update partnership', 500);
  }
}
