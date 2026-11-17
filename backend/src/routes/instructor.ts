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
  resolveUserCategories,
} from '../utils/instructorEligibility';
import { POINTS, awardPoints } from '../utils/points';
import { validateRequest, updatePartnershipRequestSchema, updatePartnershipSchema } from '../utils/validation';
import { areFriends } from './friends';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import {
  ensureOffering,
  loadCompletedPlansMap,
  loadInstructorRatings,
  loadOfferingsMap,
} from '../utils/coachingAccess';

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
 * Path-aware instructor discovery for the authenticated viewer.
 * Query: limit, offset, category (optional path key), for_paths=1 (overlap with viewer).
 */
export async function getInstructors(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '24', 10) || 24, 50);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const categoryFilter = (url.searchParams.get('category') || '').trim();
  const forPaths = url.searchParams.get('for_paths') === '1';

  try {
    const viewerCats =
      ctx.isAuthenticated && ctx.userId
        ? await resolveUserCategories(env, ctx.userId, ctx.user?.metadata)
        : [];

    const instructors = await env.DB.prepare(
      `SELECT 
        u.id,
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
      LIMIT 80`
    ).all<{
      id: string;
      points: number;
      metadata: string;
      is_instructor: boolean;
      created_at: string;
      vote_count: number;
    }>();

    type Ranked = {
      id: string;
      username: string;
      avatar: string | null;
      points: number;
      vote_count: number;
      categories: string[];
      shared_categories: string[];
      teaching_headline: string | null;
      created_at: string;
      score: number;
      weekly_fee_eur: number | null;
      sessions_per_week: number | null;
      typical_weeks: number | null;
      trial_days: number | null;
      currency: string;
      accepting: boolean;
      completed_plans: number;
      rating_avg: number | null;
      rating_count: number;
    };

    const ranked: Ranked[] = [];
    for (const row of instructors.results || []) {
      if (ctx.userId && row.id === ctx.userId) continue;
      // List loop: metadata categories only (no per-row posts fallback query).
      const cats = parseUserCategories(row.metadata);
      const meta = parseMeta(row.metadata);
      const shared = categoriesOverlap(viewerCats, cats);
      if (categoryFilter) {
        const hit = categoriesOverlap([categoryFilter], cats);
        if (hit.length === 0) continue;
      }
      if (forPaths && viewerCats.length > 0 && shared.length === 0) continue;

      const score =
        (Number(row.vote_count) || 0) * 3 +
        shared.length * 12 +
        Math.min(40, (Number(row.points) || 0) / 10);

      ranked.push({
        id: row.id,
        username: (meta.username as string) || 'Instructor',
        avatar: (meta.avatar as string) || null,
        points: Number(row.points) || 0,
        vote_count: Number(row.vote_count) || 0,
        categories: cats,
        shared_categories: shared,
        teaching_headline:
          typeof meta.teaching_headline === 'string' ? meta.teaching_headline : null,
        created_at: row.created_at,
        score,
        weekly_fee_eur: null,
        sessions_per_week: null,
        typical_weeks: null,
        trial_days: null,
        currency: 'EUR',
        accepting: true,
        completed_plans: 0,
        rating_avg: null,
        rating_count: 0,
      });
    }

    const ids = ranked.map((r) => r.id);
    const [offeringMap, completedMap, ratingMap] = await Promise.all([
      loadOfferingsMap(env, ids),
      loadCompletedPlansMap(env, ids),
      loadInstructorRatings(env, ids),
    ]);
    for (const person of ranked) {
      const offer = offeringMap.get(person.id);
      const rating = ratingMap.get(person.id);
      person.weekly_fee_eur = offer?.weekly_fee_eur ?? null;
      person.sessions_per_week = offer?.sessions_per_week ?? null;
      person.typical_weeks = offer?.typical_weeks ?? null;
      person.trial_days = offer?.trial_days ?? null;
      person.currency = offer?.currency ?? 'EUR';
      person.accepting = offer ? offer.accepting : true;
      person.completed_plans = completedMap.get(person.id) ?? 0;
      person.rating_avg = rating && rating.count > 0 ? rating.avg : null;
      person.rating_count = rating?.count ?? 0;
    }

    ranked.sort((a, b) => b.score - a.score);
    const page = ranked.slice(offset, offset + limit);

    return json({
      instructors: page,
      total: ranked.length,
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
 * GET /api/v1/instructor/eligibility/suggest-endorsers
 * Peers who share a path and have not yet endorsed the candidate.
 */
export async function suggestEndorsers(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    if (ctx.user.is_instructor) {
      return json({ suggestions: [], alreadyInstructor: true });
    }

    const myCats = await resolveUserCategories(env, ctx.userId, ctx.user.metadata);
    if (myCats.length === 0) {
      return json({ suggestions: [], alreadyInstructor: false });
    }

    const friends = await env.DB.prepare(
      `SELECT ur.target_user_id AS id, u.metadata, u.points, u.is_instructor
       FROM user_relationships ur
       JOIN users u ON u.id = ur.target_user_id
       WHERE ur.user_id = ? AND ur.type = 'friend'
       LIMIT 80`
    )
      .bind(ctx.userId)
      .all<{ id: string; metadata: string; points: number; is_instructor: number }>();

    const voted = await env.DB.prepare(
      `SELECT voter_id FROM instructor_votes WHERE candidate_id = ?`
    )
      .bind(ctx.userId)
      .all<{ voter_id: string }>();
    const votedSet = new Set((voted.results || []).map((v) => v.voter_id));

    const suggestions = [];
    for (const f of friends.results || []) {
      if (votedSet.has(f.id)) continue;
      const cats = parseUserCategories(f.metadata);
      const shared = categoriesOverlap(myCats, cats);
      if (shared.length === 0) continue;
      const meta = parseMeta(f.metadata);
      suggestions.push({
        id: f.id,
        username: (meta.username as string) || 'Friend',
        avatar: (meta.avatar as string) || null,
        points: Number(f.points) || 0,
        categories: cats,
        shared_categories: shared,
        is_instructor: !!f.is_instructor,
      });
      if (suggestions.length >= 12) break;
    }

    return json({ suggestions, alreadyInstructor: false });
  } catch (err) {
    console.error('[suggestEndorsers]', err);
    return error('DATABASE_ERROR', 'Failed to suggest endorsers', 500);
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

  const voterCats = await resolveUserCategories(env, ctx.userId, ctx.user?.metadata ?? '{}');
  const candidateCats = await resolveUserCategories(env, candidateId, candidate.metadata);
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

    // Close any pending request from candidate → voter.
    await env.DB.prepare(
      `UPDATE endorsement_requests
       SET status = 'accepted', responded_at = datetime('now')
       WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending'`
    )
      .bind(candidateId, ctx.userId)
      .run();

    const voterName = await resolveUsername(env, ctx.userId);
    await createUserNotification(env, {
      userId: candidateId,
      actorId: ctx.userId,
      type: 'endorsement_received',
      title: `${voterName} endorsed you`,
      body: 'You’re closer to unlocking the Instructor Hub.',
      refType: 'user',
      refId: ctx.userId,
    });

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

    await createUserNotification(env, {
      userId: ctx.userId,
      actorId: null,
      type: 'instructor_claim',
      title: 'Instructor unlocked',
      body: 'Teach today, check in with learners, and open partnerships.',
      refType: 'instructor',
      refId: ctx.userId,
    });

    await ensureOffering(env, ctx.userId);

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

    const voterCats = await resolveUserCategories(env, ctx.userId, ctx.user?.metadata);
    const candidateCats = await resolveUserCategories(env, candidateId, candidate.metadata);
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

    // Have they already endorsed me?
    const theyEndorsedMe = await env.DB.prepare(
      'SELECT id FROM instructor_votes WHERE user_id = ? AND candidate_id = ?'
    )
      .bind(candidateId, ctx.userId)
      .first();

    // Outgoing: I asked them to endorse me. Incoming: they asked me to endorse them.
    let pendingOutgoing = false;
    let pendingIncoming = false;
    let pendingIncomingRequestId: string | null = null;
    try {
      const out = await env.DB.prepare(
        `SELECT id FROM endorsement_requests
         WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1`
      )
        .bind(ctx.userId, candidateId)
        .first<{ id: string }>();
      pendingOutgoing = !!out;

      const incoming = await env.DB.prepare(
        `SELECT id FROM endorsement_requests
         WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1`
      )
        .bind(candidateId, ctx.userId)
        .first<{ id: string }>();
      pendingIncoming = !!incoming;
      pendingIncomingRequestId = incoming?.id || null;
    } catch {
      /* table may not exist yet on older envs */
    }

    const viewerIsInstructor = !!ctx.user?.is_instructor;
    const canRequestEndorsement =
      !isSelf &&
      !viewerIsInstructor &&
      !theyEndorsedMe &&
      sharedCategories.length > 0 &&
      !pendingOutgoing;

    return json({
      canEndorse,
      alreadyEndorsed,
      sharedCategories,
      endorsementCount,
      isSelf,
      isInstructor: !!candidate.is_instructor,
      theyEndorsedMe: !!theyEndorsedMe,
      canRequestEndorsement,
      pendingOutgoing,
      pendingIncoming,
      pendingIncomingRequestId,
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

    // Unread coach inbox + learners (friends on shared paths).
    const myCats = await resolveUserCategories(env, auth.userId, auth.user.metadata);
    const convRows = await env.DB.prepare(
      `SELECT c.*,
        (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender_id
       FROM conversations c
       WHERE c.user_a = ? OR c.user_b = ?
       ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
       LIMIT 40`
    )
      .bind(auth.userId, auth.userId)
      .all<{
        id: string;
        user_a: string;
        user_b: string;
        last_message_at: string | null;
        updated_at: string;
        user_a_last_read_at: string | null;
        user_b_last_read_at: string | null;
        last_sender_id: string | null;
      }>();

    let unread_messages = 0;
    for (const c of convRows.results || []) {
      const lastAt = c.last_message_at || c.updated_at;
      const readAt =
        c.user_a === auth.userId ? c.user_a_last_read_at : c.user_b_last_read_at;
      if (
        lastAt &&
        c.last_sender_id &&
        c.last_sender_id !== auth.userId &&
        (!readAt || new Date(lastAt).getTime() > new Date(readAt).getTime())
      ) {
        unread_messages += 1;
      }
    }

    const friendRows = await env.DB.prepare(
      `SELECT ur.target_user_id AS id, u.metadata, u.points
       FROM user_relationships ur
       JOIN users u ON u.id = ur.target_user_id
       WHERE ur.user_id = ? AND ur.type = 'friend'
       LIMIT 60`
    )
      .bind(auth.userId)
      .all<{ id: string; metadata: string; points: number }>();

    const endorserIds = new Set(endorsers.map((e) => e.id));
    const learners = [];
    for (const f of friendRows.results || []) {
      if (endorserIds.has(f.id)) continue;
      const cats = parseUserCategories(f.metadata);
      const shared = categoriesOverlap(myCats, cats);
      if (shared.length === 0) continue;
      const meta = parseMeta(f.metadata);
      learners.push({
        id: f.id,
        username: (meta.username as string) || 'Friend',
        avatar: (meta.avatar as string) || null,
        points: Number(f.points) || 0,
        categories: cats,
        shared_categories: shared,
        is_friend: true,
      });
      if (learners.length >= 16) break;
    }

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
        unread_messages,
        learners: learners.length,
      },
      endorsers,
      learners,
      pending_requests,
      partnerships: activePartnerships,
      actions: {
        teach_today: true,
        open_inbox: unread_messages > 0,
        review_partners: pending_requests.length > 0,
        check_in_learners: learners.length > 0 || endorsers.length > 0,
      },
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

/**
 * POST /api/v1/instructor/candidates/:userId/request-endorsement
 * Ask another person (shared path) to endorse you.
 */
export async function requestEndorsement(
  request: Request,
  env: Env,
  targetUserId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId || !ctx.user) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (ctx.userId === targetUserId) {
    return error('INVALID_REQUEST', 'You cannot request an endorsement from yourself', 400);
  }

  let body: { message?: string } = {};
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    body = {};
  }
  const message =
    typeof body.message === 'string' ? body.message.trim().slice(0, 280) : '';

  const target = await env.DB.prepare(
    'SELECT id, metadata, is_instructor FROM users WHERE id = ?'
  )
    .bind(targetUserId)
    .first<{ id: string; metadata: string; is_instructor: number }>();

  if (!target) {
    return error('USER_NOT_FOUND', 'User not found', 404);
  }

  if (ctx.user.is_instructor) {
    return error('ALREADY_INSTRUCTOR', 'You are already an instructor', 400);
  }

  const myCats = await resolveUserCategories(env, ctx.userId, ctx.user.metadata);
  const theirCats = await resolveUserCategories(env, targetUserId, target.metadata);
  const shared = categoriesOverlap(myCats, theirCats);
  if (shared.length === 0) {
    return error(
      'NO_CATEGORY_OVERLAP',
      'You can only request endorsements from people who share a growth path',
      400
    );
  }

  const already = await env.DB.prepare(
    'SELECT id FROM instructor_votes WHERE user_id = ? AND candidate_id = ?'
  )
    .bind(targetUserId, ctx.userId)
    .first();
  if (already) {
    return error('ALREADY_VOTED', 'They already endorsed you', 400);
  }

  try {
    const pending = await env.DB.prepare(
      `SELECT id FROM endorsement_requests
       WHERE from_user_id = ? AND to_user_id = ? AND status = 'pending' LIMIT 1`
    )
      .bind(ctx.userId, targetUserId)
      .first<{ id: string }>();

    if (pending) {
      return json({
        requested: true,
        requestId: pending.id,
        message: 'Endorsement request already pending',
      });
    }

    const id = generateId('ereq');
    await env.DB.prepare(
      `INSERT INTO endorsement_requests
        (id, from_user_id, to_user_id, message, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', datetime('now'))`
    )
      .bind(id, ctx.userId, targetUserId, message || null)
      .run();

    const fromName = await resolveUsername(env, ctx.userId);
    await createUserNotification(env, {
      userId: targetUserId,
      actorId: ctx.userId,
      type: 'endorsement_request',
      title: `${fromName} asked for your endorsement`,
      body: message || 'They share a growth path with you.',
      refType: 'endorsement_request',
      refId: id,
    });

    return json({ requested: true, requestId: id }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) {
      return error('DATABASE_ERROR', 'Endorsement requests not migrated yet', 500);
    }
    console.error('[requestEndorsement]', err);
    return error('DATABASE_ERROR', 'Failed to request endorsement', 500);
  }
}

/**
 * PATCH /api/v1/instructor/endorsement-requests/:id
 * Accept (endorse) or decline a pending request.
 */
export async function respondToEndorsementRequest(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { status?: string };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const status = body.status === 'accepted' || body.status === 'declined' ? body.status : null;
  if (!status) {
    return error('VALIDATION_ERROR', 'status must be accepted or declined', 400);
  }

  try {
    const row = await env.DB.prepare(
      `SELECT id, from_user_id, to_user_id, status FROM endorsement_requests WHERE id = ?`
    )
      .bind(requestId)
      .first<{
        id: string;
        from_user_id: string;
        to_user_id: string;
        status: string;
      }>();

    if (!row) return error('NOT_FOUND', 'Request not found', 404);
    if (row.to_user_id !== ctx.userId) {
      return error('FORBIDDEN', 'Not your endorsement request', 403);
    }
    if (row.status !== 'pending') {
      return error('ALREADY_RESOLVED', 'Request already resolved', 400);
    }

    if (status === 'declined') {
      await env.DB.prepare(
        `UPDATE endorsement_requests
         SET status = 'declined', responded_at = datetime('now') WHERE id = ?`
      )
        .bind(requestId)
        .run();
      return json({ ok: true, status: 'declined' });
    }

    // Accept = cast endorsement vote as the recipient.
    const voteRes = await voteInstructor(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({}),
      }),
      env,
      row.from_user_id
    );

    if (!voteRes.ok) {
      // Still mark declined? Keep pending if vote failed for overlap reasons.
      const payload = (await voteRes.clone().json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      return error(
        payload?.error?.code || 'ENDORSE_FAILED',
        payload?.error?.message || 'Could not endorse',
        voteRes.status
      );
    }

    await env.DB.prepare(
      `UPDATE endorsement_requests
       SET status = 'accepted', responded_at = datetime('now') WHERE id = ?`
    )
      .bind(requestId)
      .run();

    const voteJson = (await voteRes.json()) as { data?: unknown };
    return json({ ok: true, status: 'accepted', vote: voteJson?.data ?? voteJson });
  } catch (err) {
    console.error('[respondToEndorsementRequest]', err);
    return error('DATABASE_ERROR', 'Failed to respond to request', 500);
  }
}

/**
 * GET /api/v1/instructor/endorsement-requests
 * Pending requests addressed to me.
 */
export async function listIncomingEndorsementRequests(
  request: Request,
  env: Env
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const rows = await env.DB.prepare(
      `SELECT er.id, er.from_user_id, er.message, er.created_at, u.metadata, u.points
       FROM endorsement_requests er
       JOIN users u ON u.id = er.from_user_id
       WHERE er.to_user_id = ? AND er.status = 'pending'
       ORDER BY er.created_at DESC
       LIMIT 40`
    )
      .bind(ctx.userId)
      .all<{
        id: string;
        from_user_id: string;
        message: string | null;
        created_at: string;
        metadata: string;
        points: number;
      }>();

    const requests = [];
    const myCats = await resolveUserCategories(env, ctx.userId, ctx.user?.metadata);
    for (const row of rows.results || []) {
      const meta = parseMeta(row.metadata);
      const cats = parseUserCategories(row.metadata);
      requests.push({
        id: row.id,
        message: row.message,
        created_at: row.created_at,
        from: {
          id: row.from_user_id,
          username: (meta.username as string) || 'Member',
          avatar: (meta.avatar as string) || null,
          points: Number(row.points) || 0,
          categories: cats,
          shared_categories: categoriesOverlap(myCats, cats),
        },
      });
    }

    return json({ requests });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) return json({ requests: [] });
    console.error('[listIncomingEndorsementRequests]', err);
    return error('DATABASE_ERROR', 'Failed to load requests', 500);
  }
}
