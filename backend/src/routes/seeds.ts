import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import { resolveUserCategories } from '../utils/instructorEligibility';

type SeedRow = {
  id: string;
  category_key: string;
  subcategory_key: string;
  title: string;
  stage: string;
  growth_score: number;
  status: string;
  ownership: string;
  visibility: string;
  planted_by_user_id: string;
  planted_at: string;
  matured_at: string | null;
  resting_at: string | null;
  created_at: string;
  updated_at: string;
  metric_type?: string | null;
  metric_unit?: string | null;
  metric_start?: number | null;
  metric_target?: number | null;
  metric_current?: number | null;
  goal_detail?: string | null;
};

type MemberRow = {
  seed_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
};

const STAGE_THRESHOLDS: { stage: string; min: number }[] = [
  { stage: 'mature', min: 50 },
  { stage: 'tree', min: 30 },
  { stage: 'sapling', min: 15 },
  { stage: 'sprout', min: 5 },
  { stage: 'seed', min: 0 },
];

const MAX_ACTIVE = 3;
const ACTION_DELTA: Record<string, number> = {
  check_in: 3,
  journal: 5,
  water: 2,
  instructor_tend: 4,
  breathe: 1,
};

/** Photo-backed metric check-ins water a bit more. */
const EVIDENCE_BONUS = 2;

/** User may plant only on their growth paths (parent or parent:sub). */
function pathAllowedOnUser(
  userCats: string[],
  categoryKey: string,
  subcategoryKey: string
): boolean {
  if (!userCats.length) return false;
  const full = `${categoryKey}:${subcategoryKey}`;
  for (const raw of userCats) {
    const c = String(raw || '').trim();
    if (!c) continue;
    if (c === full) return true;
    if (c === categoryKey) return true;
    if (!c.includes(':') && c.toLowerCase() === categoryKey.toLowerCase()) return true;
  }
  return false;
}

function daysSincePlanted(plantedAt: string | null | undefined): number {
  if (!plantedAt) return 0;
  const t = new Date(plantedAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function stageForScore(score: number, status: string): string {
  if (status === 'mature') return 'mature';
  for (const t of STAGE_THRESHOLDS) {
    if (score >= t.min && t.stage !== 'mature') return t.stage;
  }
  return 'seed';
}

function parseBody<T>(raw: unknown): T {
  return (raw || {}) as T;
}

async function getMember(
  env: Env,
  seedId: string,
  userId: string
): Promise<MemberRow | null> {
  return env.DB.prepare(
    `SELECT * FROM growth_seed_members WHERE seed_id = ? AND user_id = ?`
  )
    .bind(seedId, userId)
    .first<MemberRow>();
}

async function countActiveGrowing(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as c
     FROM growth_seed_members m
     JOIN growth_seeds s ON s.id = m.seed_id
     WHERE m.user_id = ? AND m.status = 'active' AND m.role = 'owner'
       AND s.status IN ('growing', 'resting')`
  )
    .bind(userId)
    .first<{ c: number }>();
  return Number(row?.c) || 0;
}

type MemberJoinRow = MemberRow & { metadata: string; is_instructor: number };

function mapMemberRow(r: MemberJoinRow) {
  let username = 'User';
  let avatar: string | null = null;
  try {
    const meta = JSON.parse(r.metadata || '{}') as { username?: string; avatar?: string };
    username = meta.username || username;
    avatar = meta.avatar || null;
  } catch {
    /* ignore */
  }
  return {
    user_id: r.user_id,
    role: r.role,
    status: r.status,
    joined_at: r.joined_at,
    username,
    avatar,
    is_instructor: !!r.is_instructor,
  };
}

async function loadMembers(env: Env, seedId: string) {
  const rows = await env.DB.prepare(
    `SELECT m.*, u.metadata, u.is_instructor
     FROM growth_seed_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.seed_id = ? AND m.status IN ('active', 'pending')`
  )
    .bind(seedId)
    .all<MemberJoinRow>();

  return (rows.results || []).map(mapMemberRow);
}

/** Members for many seeds in one query (ids passed as one JSON param — no 100-param limit). */
async function loadMembersForSeeds(
  env: Env,
  seedIds: string[]
): Promise<Map<string, ReturnType<typeof mapMemberRow>[]>> {
  const bySeed = new Map<string, ReturnType<typeof mapMemberRow>[]>();
  if (seedIds.length === 0) return bySeed;
  const rows = await env.DB.prepare(
    `SELECT m.*, u.metadata, u.is_instructor
     FROM growth_seed_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.seed_id IN (SELECT value FROM json_each(?))
       AND m.status IN ('active', 'pending')`
  )
    .bind(JSON.stringify(seedIds))
    .all<MemberJoinRow>();
  for (const r of rows.results || []) {
    const list = bySeed.get(r.seed_id) || [];
    list.push(mapMemberRow(r));
    bySeed.set(r.seed_id, list);
  }
  return bySeed;
}

/**
 * Seed invites go only to existing users the inviter is connected to:
 * friends (either direction) or a coaching relationship (inquiry or contract).
 */
async function canInviteToSeed(env: Env, inviterId: string, targetId: string): Promise<boolean> {
  if (!targetId || targetId === inviterId) return false;
  const row = await env.DB.prepare(
    `SELECT u.id,
       EXISTS (
         SELECT 1 FROM user_relationships r
         WHERE r.type = 'friend'
           AND ((r.user_id = ? AND r.target_user_id = u.id) OR (r.user_id = u.id AND r.target_user_id = ?))
       ) AS is_friend,
       EXISTS (
         SELECT 1 FROM coaching_inquiries ci
         WHERE (ci.instructor_id = ? AND ci.client_id = u.id) OR (ci.instructor_id = u.id AND ci.client_id = ?)
       ) AS has_inquiry,
       EXISTS (
         SELECT 1 FROM coaching_contracts cc
         WHERE (cc.instructor_id = ? AND cc.client_id = u.id) OR (cc.instructor_id = u.id AND cc.client_id = ?)
       ) AS has_contract
     FROM users u
     WHERE u.id = ?`
  )
    .bind(inviterId, inviterId, inviterId, inviterId, inviterId, inviterId, targetId)
    .first<{ id: string; is_friend: number; has_inquiry: number; has_contract: number }>();
  if (!row) return false;
  return !!(Number(row.is_friend) || Number(row.has_inquiry) || Number(row.has_contract));
}

const MAX_SEED_TITLE = 120;
const MAX_METRIC_LABEL = 40;
const LIST_SEEDS_LIMIT = 100;

/** Check-in photos: an https URL or our own media path (/api/v1/media/...). */
function isAllowedSeedPhotoUrl(raw: string): boolean {
  if (raw.length > 2048) return false;
  if (/^\/api\/v\d+\/media\//i.test(raw)) return true;
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatSeed(row: SeedRow, members: Awaited<ReturnType<typeof loadMembers>>) {
  const nextStage = STAGE_THRESHOLDS.find(
    (t) => t.stage !== 'mature' && row.growth_score < t.min
  );
  const matureAt = 50;
  const metricStart = row.metric_start ?? null;
  const metricTarget = row.metric_target ?? null;
  const metricCurrent = row.metric_current ?? null;
  let metric_progress: number | null = null;
  if (metricStart != null && metricTarget != null && metricCurrent != null && metricStart !== metricTarget) {
    metric_progress = Math.max(
      0,
      Math.min(1, (metricCurrent - metricStart) / (metricTarget - metricStart))
    );
  }
  return {
    id: row.id,
    category_key: row.category_key,
    subcategory_key: row.subcategory_key,
    title: row.title,
    stage: row.stage,
    growth_score: row.growth_score,
    status: row.status,
    ownership: row.ownership,
    visibility: row.visibility,
    planted_by_user_id: row.planted_by_user_id,
    planted_at: row.planted_at,
    matured_at: row.matured_at,
    resting_at: row.resting_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    progress_to_mature: Math.min(1, row.growth_score / matureAt),
    next_threshold: nextStage?.min ?? matureAt,
    days_since_planted: daysSincePlanted(row.planted_at),
    metric_type: row.metric_type || null,
    metric_unit: row.metric_unit || null,
    metric_start: metricStart,
    metric_target: metricTarget,
    metric_current: metricCurrent,
    metric_progress,
    goal_detail: row.goal_detail || null,
    members,
  };
}

async function getSeedOr404(env: Env, seedId: string): Promise<SeedRow | null> {
  return env.DB.prepare(`SELECT * FROM growth_seeds WHERE id = ?`)
    .bind(seedId)
    .first<SeedRow>();
}

/**
 * GET /api/v1/seeds?scope=growing|garden|all
 */
export async function listSeeds(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'growing';

  let statusFilter = `s.status IN ('growing', 'resting')`;
  if (scope === 'garden') statusFilter = `s.status = 'mature'`;
  if (scope === 'all') statusFilter = `s.status IN ('growing', 'resting', 'mature')`;

  try {
    const rows = await env.DB.prepare(
      `SELECT s.*
       FROM growth_seeds s
       JOIN growth_seed_members m ON m.seed_id = s.id
       WHERE m.user_id = ? AND m.status = 'active' AND m.role IN ('owner', 'instructor', 'witness')
         AND ${statusFilter}
       ORDER BY COALESCE(s.matured_at, s.updated_at) DESC
       LIMIT ${LIST_SEEDS_LIMIT}`
    )
      .bind(ctx.userId)
      .all<SeedRow>();

    const seedRows = rows.results || [];
    const membersBySeed = await loadMembersForSeeds(
      env,
      seedRows.map((r) => r.id)
    );
    const seeds = seedRows.map((row) => formatSeed(row, membersBySeed.get(row.id) || []));

    const maturedRow = await env.DB.prepare(
      `SELECT COUNT(*) as c
       FROM growth_seed_members m
       JOIN growth_seeds s ON s.id = m.seed_id
       WHERE m.user_id = ? AND m.status = 'active' AND m.role = 'owner' AND s.status = 'mature'`
    )
      .bind(ctx.userId)
      .first<{ c: number }>();

    return json({
      seeds,
      matured_tree_count: Number(maturedRow?.c) || 0,
      active_growing_count: await countActiveGrowing(env, ctx.userId),
      max_active: MAX_ACTIVE,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) {
      return json({ seeds: [], matured_tree_count: 0, active_growing_count: 0, max_active: MAX_ACTIVE });
    }
    console.error('[listSeeds]', err);
    return error('DATABASE_ERROR', 'Failed to list seeds', 500);
  }
}

/**
 * POST /api/v1/seeds
 * Body: { category_key, subcategory_key, title?, metric_*, invite_* }
 */
export async function createSeed(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: {
    category_key?: string;
    subcategory_key?: string;
    title?: string;
    invite_user_id?: string;
    invite_role?: 'witness' | 'owner' | 'instructor';
    metric_type?: string;
    metric_unit?: string;
    metric_start?: number;
    metric_target?: number;
    goal_detail?: string;
  };
  try {
    body = parseBody(await request.json());
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const categoryKey = (body.category_key || '').trim();
  const subcategoryKey = (body.subcategory_key || '').trim();
  if (!categoryKey || !subcategoryKey) {
    return error('VALIDATION_ERROR', 'category_key and subcategory_key are required', 400);
  }

  const userCats = await resolveUserCategories(env, ctx.userId, ctx.user?.metadata);
  if (!pathAllowedOnUser(userCats, categoryKey, subcategoryKey)) {
    return error(
      'PATH_REQUIRED',
      'You can only plant seeds on your growth paths. Update Paths on your profile first.',
      400
    );
  }

  const title =
    (typeof body.title === 'string' ? body.title : '').trim() ||
    subcategoryKey
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  if (title.length > MAX_SEED_TITLE) {
    return error('VALIDATION_ERROR', `Title must be at most ${MAX_SEED_TITLE} characters`, 400);
  }

  const metricType = (typeof body.metric_type === 'string' ? body.metric_type : '').trim() || null;
  const metricUnit = (typeof body.metric_unit === 'string' ? body.metric_unit : '').trim() || null;
  if ((metricType && metricType.length > MAX_METRIC_LABEL) || (metricUnit && metricUnit.length > MAX_METRIC_LABEL)) {
    return error('VALIDATION_ERROR', `Goal type and unit must be at most ${MAX_METRIC_LABEL} characters`, 400);
  }
  const metricStart =
    typeof body.metric_start === 'number' && Number.isFinite(body.metric_start)
      ? body.metric_start
      : null;
  const metricTarget =
    typeof body.metric_target === 'number' && Number.isFinite(body.metric_target)
      ? body.metric_target
      : null;

  if (metricType && (metricStart == null || metricTarget == null)) {
    return error('VALIDATION_ERROR', 'metric_start and metric_target are required for this goal', 400);
  }

  const goalDetail = (body.goal_detail || '').trim().slice(0, 800) || null;

  const active = await countActiveGrowing(env, ctx.userId);
  if (active >= MAX_ACTIVE) {
    return error('LIMIT_REACHED', `You can grow up to ${MAX_ACTIVE} seeds at a time`, 400);
  }

  const inviteRole = body.invite_role || 'witness';
  if (!['witness', 'owner', 'instructor'].includes(inviteRole)) {
    return error('VALIDATION_ERROR', 'Invalid invite role', 400);
  }
  const inviteUserId =
    (typeof body.invite_user_id === 'string' ? body.invite_user_id : '').trim() || null;
  if (inviteUserId && inviteUserId !== ctx.userId && !(await canInviteToSeed(env, ctx.userId, inviteUserId))) {
    return error('FORBIDDEN', 'You can only invite friends or people you coach with', 403);
  }
  const ownership = inviteUserId && inviteRole === 'owner' ? 'shared' : 'solo';

  const seedId = generateId('seed');
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO growth_seeds
        (id, category_key, subcategory_key, title, stage, growth_score, status, ownership,
         visibility, planted_by_user_id, planted_at, created_at, updated_at,
         metric_type, metric_unit, metric_start, metric_target, metric_current, goal_detail)
       VALUES (?, ?, ?, ?, 'seed', 0, 'growing', ?, 'private', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        seedId,
        categoryKey,
        subcategoryKey,
        title,
        ownership,
        ctx.userId,
        now,
        now,
        now,
        metricType,
        metricUnit,
        metricStart,
        metricTarget,
        metricStart,
        goalDetail
      )
      .run();

    await env.DB.prepare(
      `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
       VALUES (?, ?, 'owner', 'active', ?)`
    )
      .bind(seedId, ctx.userId, now)
      .run();

    if (inviteUserId && inviteUserId !== ctx.userId) {
      if (inviteRole === 'owner') {
        const theirActive = await countActiveGrowing(env, inviteUserId);
        if (theirActive >= MAX_ACTIVE) {
          // Keep seed solo; skip co-plant invite
        } else {
          await env.DB.prepare(
            `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
             VALUES (?, ?, 'owner', 'pending', ?)`
          )
            .bind(seedId, inviteUserId, now)
            .run();
          const actorName = await resolveUsername(env, ctx.userId);
          await createUserNotification(env, {
            userId: inviteUserId,
            actorId: ctx.userId,
            type: 'system',
            title: `${actorName} invited you to grow a seed together`,
            body: title,
            refType: 'growth_seed',
            refId: seedId,
          });
        }
      } else {
        await env.DB.prepare(
          `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
           VALUES (?, ?, ?, 'pending', ?)`
        )
          .bind(seedId, inviteUserId, inviteRole === 'instructor' ? 'instructor' : 'witness', now)
          .run();
        const actorName = await resolveUsername(env, ctx.userId);
        await createUserNotification(env, {
          userId: inviteUserId,
          actorId: ctx.userId,
          type: 'system',
          title:
            inviteRole === 'instructor'
              ? `${actorName} shared a seed with you to tend`
              : `${actorName} asked you to witness their growth`,
          body: title,
          refType: 'growth_seed',
          refId: seedId,
        });
      }
    }

    const row = await getSeedOr404(env, seedId);
    const members = await loadMembers(env, seedId);
    return json({ seed: formatSeed(row!, members) }, 201);
  } catch (err) {
    console.error('[createSeed]', err);
    return error('DATABASE_ERROR', 'Failed to plant seed', 500);
  }
}

/**
 * GET /api/v1/seeds/:id
 */
export async function getSeed(
  request: Request,
  env: Env,
  seedId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const member = await getMember(env, seedId, ctx.userId);
    if (!member || (member.status !== 'active' && member.status !== 'pending')) {
      return error('FORBIDDEN', 'Not a member of this seed', 403);
    }
    const row = await getSeedOr404(env, seedId);
    if (!row) return error('NOT_FOUND', 'Seed not found', 404);
    const members = await loadMembers(env, seedId);

    const events = await env.DB.prepare(
      `SELECT e.*, u.metadata
       FROM growth_seed_events e
       JOIN users u ON u.id = e.actor_user_id
       WHERE e.seed_id = ?
       ORDER BY e.created_at DESC
       LIMIT 30`
    )
      .bind(seedId)
      .all<{
        id: string;
        actor_user_id: string;
        action: string;
        delta: number;
        created_at: string;
        metadata: string;
        note?: string | null;
        photo_url?: string | null;
        metric_value?: number | null;
        days_since_plant?: number | null;
      }>();

    const activity = (events.results || []).map((e) => {
      let username = 'Someone';
      try {
        username =
          (JSON.parse(e.metadata || '{}') as { username?: string }).username || username;
      } catch {
        /* ignore */
      }
      return {
        id: e.id,
        actor_user_id: e.actor_user_id,
        username,
        action: e.action,
        delta: e.delta,
        created_at: e.created_at,
        note: e.note || null,
        photo_url: e.photo_url || null,
        metric_value: e.metric_value ?? null,
        days_since_plant: e.days_since_plant ?? null,
      };
    });

    return json({
      seed: formatSeed(row, members),
      activity,
      my_role: member.role,
      my_member_status: member.status,
    });
  } catch (err) {
    console.error('[getSeed]', err);
    return error('DATABASE_ERROR', 'Failed to load seed', 500);
  }
}

/**
 * POST /api/v1/seeds/:id/water
 * Body: { action?, note?, photo_url?, metric_value? }
 */
export async function waterSeed(
  request: Request,
  env: Env,
  seedId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: {
    action?: string;
    note?: string;
    photo_url?: string;
    metric_value?: number;
  } = {};
  try {
    body = parseBody(await request.json());
  } catch {
    body = {};
  }

  const action = (body.action || 'check_in').trim();
  const delta = ACTION_DELTA[action];
  if (!delta) {
    return error('VALIDATION_ERROR', 'Unknown water action', 400);
  }

  const note = (body.note || '').trim().slice(0, 500) || null;
  const photoUrl = (typeof body.photo_url === 'string' ? body.photo_url : '').trim() || null;
  if (photoUrl && !isAllowedSeedPhotoUrl(photoUrl)) {
    return error('VALIDATION_ERROR', 'Photo must be an uploaded image (https)', 400);
  }
  const metricValue =
    typeof body.metric_value === 'number' && Number.isFinite(body.metric_value)
      ? body.metric_value
      : null;

  try {
    const member = await getMember(env, seedId, ctx.userId);
    if (!member || member.status !== 'active') {
      return error('FORBIDDEN', 'You cannot water this seed', 403);
    }
    if (action === 'instructor_tend' && member.role !== 'instructor' && member.role !== 'owner') {
      return error('FORBIDDEN', 'Only instructors can tend this way', 403);
    }

    const row = await getSeedOr404(env, seedId);
    if (!row) return error('NOT_FOUND', 'Seed not found', 404);
    if (row.status === 'mature') {
      return error('INVALID_STATE', 'This seed is already in the Garden', 400);
    }

    const hasMetricGoal = !!(row.metric_type && row.metric_target != null);
    if (action === 'check_in' && hasMetricGoal && member.role === 'owner') {
      if (metricValue == null) {
        return error('VALIDATION_ERROR', 'Enter your updated number for this check-in', 400);
      }
      if (!photoUrl) {
        return error('VALIDATION_ERROR', 'Photo evidence is required for this goal check-in', 400);
      }
    }

    const evidenceBonus =
      action === 'check_in' && photoUrl && member.role !== 'witness' ? EVIDENCE_BONUS : 0;
    const applyDelta = member.role === 'witness' ? 0 : delta + evidenceBonus;
    const newScore = row.growth_score + applyDelta;
    const newStage = stageForScore(newScore, row.status);
    const stagedUp = newStage !== row.stage;
    const days = daysSincePlanted(row.planted_at);

    await env.DB.prepare(
      `INSERT INTO growth_seed_events
        (id, seed_id, actor_user_id, action, delta, created_at, note, photo_url, metric_value, days_since_plant)
       VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`
    )
      .bind(
        generateId('sevt'),
        seedId,
        ctx.userId,
        action,
        applyDelta,
        note,
        photoUrl,
        metricValue,
        days
      )
      .run();

    if (metricValue != null && member.role === 'owner') {
      await env.DB.prepare(
        `UPDATE growth_seeds
         SET growth_score = ?, stage = ?, status = 'growing', resting_at = NULL,
             metric_current = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(newScore, newStage, metricValue, seedId)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE growth_seeds
         SET growth_score = ?, stage = ?, status = 'growing', resting_at = NULL, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(newScore, newStage, seedId)
        .run();
    }

    if (action === 'check_in' && photoUrl && member.role === 'owner') {
      try {
        await env.DB.prepare(
          `UPDATE coaching_assignments
           SET status = 'done', completed_at = datetime('now')
           WHERE seed_id = ? AND status = 'assigned'`
        )
          .bind(seedId)
          .run();
      } catch {
        /* homework tables may not exist yet */
      }
    }

    if (stagedUp) {
      const members = await loadMembers(env, seedId);
      const actorName = await resolveUsername(env, ctx.userId);
      for (const m of members) {
        if (m.user_id === ctx.userId || m.status !== 'active') continue;
        await createUserNotification(env, {
          userId: m.user_id,
          actorId: ctx.userId,
          type: 'system',
          title: `${actorName} helped a seed reach ${newStage}`,
          body: row.title,
          refType: 'growth_seed',
          refId: seedId,
        });
      }
    }

    const updated = await getSeedOr404(env, seedId);
    const members = await loadMembers(env, seedId);
    return json({
      seed: formatSeed(updated!, members),
      staged_up: stagedUp,
      can_mature: newScore >= 50 && updated!.status !== 'mature',
    });
  } catch (err) {
    console.error('[waterSeed]', err);
    return error('DATABASE_ERROR', 'Failed to water seed', 500);
  }
}

/**
 * POST /api/v1/seeds/:id/accept — accept pending co-plant / witness / instructor invite
 */
export async function acceptSeedInvite(
  request: Request,
  env: Env,
  seedId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const member = await getMember(env, seedId, ctx.userId);
    if (!member || member.status !== 'pending') {
      return error('NOT_FOUND', 'No pending invite', 404);
    }

    if (member.role === 'owner') {
      const active = await countActiveGrowing(env, ctx.userId);
      if (active >= MAX_ACTIVE) {
        return error('LIMIT_REACHED', `You can grow up to ${MAX_ACTIVE} seeds at a time`, 400);
      }
    }

    await env.DB.prepare(
      `UPDATE growth_seed_members SET status = 'active', joined_at = datetime('now')
       WHERE seed_id = ? AND user_id = ?`
    )
      .bind(seedId, ctx.userId)
      .run();

    if (member.role === 'owner') {
      await env.DB.prepare(
        `UPDATE growth_seeds SET ownership = 'shared', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(seedId)
        .run();
    }

    const row = await getSeedOr404(env, seedId);
    const planter = row?.planted_by_user_id;
    if (planter && planter !== ctx.userId) {
      const name = await resolveUsername(env, ctx.userId);
      await createUserNotification(env, {
        userId: planter,
        actorId: ctx.userId,
        type: 'system',
        title: `${name} accepted your seed invite`,
        body: row?.title || null,
        refType: 'growth_seed',
        refId: seedId,
      });
    }

    const members = await loadMembers(env, seedId);
    return json({ seed: formatSeed(row!, members) });
  } catch (err) {
    console.error('[acceptSeedInvite]', err);
    return error('DATABASE_ERROR', 'Failed to accept invite', 500);
  }
}

/**
 * POST /api/v1/seeds/:id/mature — call into Garden
 */
export async function matureSeed(
  request: Request,
  env: Env,
  seedId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const member = await getMember(env, seedId, ctx.userId);
    if (!member || member.status !== 'active' || member.role !== 'owner') {
      return error('FORBIDDEN', 'Only owners can call a seed into the Garden', 403);
    }

    const row = await getSeedOr404(env, seedId);
    if (!row) return error('NOT_FOUND', 'Seed not found', 404);
    if (row.status === 'mature') {
      return error('INVALID_STATE', 'Already in the Garden', 400);
    }
    if (row.growth_score < 50) {
      return error('NOT_READY', 'Keep watering until this seed is ready', 400);
    }

    await env.DB.prepare(
      `UPDATE growth_seeds
       SET status = 'mature', stage = 'mature', matured_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(seedId)
      .run();

    await env.DB.prepare(
      `INSERT INTO growth_seed_events (id, seed_id, actor_user_id, action, delta, created_at)
       VALUES (?, ?, ?, 'mature', 0, datetime('now'))`
    )
      .bind(generateId('sevt'), seedId, ctx.userId)
      .run();

    const members = await loadMembers(env, seedId);
    const actorName = await resolveUsername(env, ctx.userId);
    for (const m of members) {
      if (m.user_id === ctx.userId || m.status !== 'active') continue;
      await createUserNotification(env, {
        userId: m.user_id,
        actorId: ctx.userId,
        type: 'system',
        title: `${actorName} called a tree into the Garden`,
        body: row.title,
        refType: 'growth_seed',
        refId: seedId,
      });
    }

    const updated = await getSeedOr404(env, seedId);
    return json({ seed: formatSeed(updated!, members) });
  } catch (err) {
    console.error('[matureSeed]', err);
    return error('DATABASE_ERROR', 'Failed to mature seed', 500);
  }
}

/**
 * POST /api/v1/seeds/:id/invite
 * Body: { user_id, role: witness|owner|instructor }
 */
export async function inviteToSeed(
  request: Request,
  env: Env,
  seedId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { user_id?: string; role?: string } = {};
  try {
    body = parseBody(await request.json());
  } catch {
    return error('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const targetId = (typeof body.user_id === 'string' ? body.user_id : '').trim();
  const role = (body.role || 'witness') as 'witness' | 'owner' | 'instructor';
  if (!targetId) return error('VALIDATION_ERROR', 'user_id required', 400);
  if (!['witness', 'owner', 'instructor'].includes(role)) {
    return error('VALIDATION_ERROR', 'Invalid role', 400);
  }

  try {
    const me = await getMember(env, seedId, ctx.userId);
    if (!me || me.status !== 'active' || me.role !== 'owner') {
      return error('FORBIDDEN', 'Only owners can invite', 403);
    }
    if (!(await canInviteToSeed(env, ctx.userId, targetId))) {
      return error('FORBIDDEN', 'You can only invite friends or people you coach with', 403);
    }

    const existing = await getMember(env, seedId, targetId);
    if (existing && existing.status === 'active') {
      return error('ALREADY_MEMBER', 'Already on this seed', 400);
    }

    const now = new Date().toISOString();
    if (existing) {
      await env.DB.prepare(
        `UPDATE growth_seed_members SET role = ?, status = 'pending', joined_at = ? WHERE seed_id = ? AND user_id = ?`
      )
        .bind(role, now, seedId, targetId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO growth_seed_members (seed_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, 'pending', ?)`
      )
        .bind(seedId, targetId, role, now)
        .run();
    }

    if (role === 'owner') {
      await env.DB.prepare(
        `UPDATE growth_seeds SET ownership = 'shared', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(seedId)
        .run();
    }

    const row = await getSeedOr404(env, seedId);
    const actorName = await resolveUsername(env, ctx.userId);
    await createUserNotification(env, {
      userId: targetId,
      actorId: ctx.userId,
      type: 'system',
      title:
        role === 'owner'
          ? `${actorName} invited you to grow a seed together`
          : role === 'instructor'
            ? `${actorName} asked you to tend a seed`
            : `${actorName} asked you to witness their growth`,
      body: row?.title || null,
      refType: 'growth_seed',
      refId: seedId,
    });

    const members = await loadMembers(env, seedId);
    return json({ seed: formatSeed(row!, members) });
  } catch (err) {
    console.error('[inviteToSeed]', err);
    return error('DATABASE_ERROR', 'Failed to invite', 500);
  }
}
