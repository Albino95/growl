import { Env } from '../types';
import { json, error } from '../utils/response';
import { getRequestContext } from '../utils/auth';
import { generateId } from '../utils/id';
import { createUserNotification, resolveUsername } from '../utils/notifications';
import { resolveUserCategories } from '../utils/instructorEligibility';
import { expandCohortKeys } from './friends';

export const MAX_CIRCLE_MEMBERS = 10;

export type CircleMatchMode = 'nearby' | 'matching' | 'mix' | 'random';

export type CirclePrefs = {
  match: CircleMatchMode;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

const MATCH_MODES = new Set<CircleMatchMode>(['nearby', 'matching', 'mix', 'random']);

type GroupRow = {
  id: string;
  slug: string | null;
  name: string;
  path_key: string;
  kind: string;
  description: string | null;
  accent: string | null;
  created_by: string | null;
  created_at: string;
  max_members?: number | null;
  parent_id?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  member_count?: number;
  pulse_count?: number;
  joined?: number;
  role?: string | null;
  last_pulse_at?: string | null;
  last_activity_at?: string | null;
  voice_wait?: number;
  video_wait?: number;
};

function matchesPath(userCats: string[], pathKey: string): boolean {
  if (!pathKey || pathKey === 'grove') return true;
  const keys = expandCohortKeys(userCats);
  return keys.has(pathKey.toLowerCase());
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  try {
    const m = JSON.parse(raw || '{}') as unknown;
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseCirclePrefs(raw: string | null | undefined): CirclePrefs {
  const meta = parseMeta(raw);
  const p =
    meta.circle_prefs && typeof meta.circle_prefs === 'object'
      ? (meta.circle_prefs as Record<string, unknown>)
      : {};
  const matchRaw = String(p.match || 'mix');
  const match = MATCH_MODES.has(matchRaw as CircleMatchMode)
    ? (matchRaw as CircleMatchMode)
    : 'mix';
  const city = typeof p.city === 'string' ? p.city.trim().slice(0, 80) || null : null;
  const country = typeof p.country === 'string' ? p.country.trim().slice(0, 80) || null : null;
  let lat = asFiniteNumber(p.lat);
  let lng = asFiniteNumber(p.lng);
  if (lat != null) lat = Math.max(-90, Math.min(90, lat));
  if (lng != null) lng = Math.max(-180, Math.min(180, lng));
  return { match, city, country, lat, lng };
}

function capOf(row: { max_members?: number | null }): number {
  const n = Number(row.max_members);
  return Number.isFinite(n) && n > 0 ? Math.min(50, Math.floor(n)) : MAX_CIRCLE_MEMBERS;
}

function vibeOf(count: number, max: number): 'warming' | 'live' | 'full' {
  if (count >= max) return 'full';
  if (count >= 4) return 'live';
  return 'warming';
}

function mapGroup(row: GroupRow) {
  const memberCount = Number(row.member_count) || 0;
  const maxMembers = capOf(row);
  const seatsLeft = Math.max(0, maxMembers - memberCount);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    path_key: row.path_key,
    kind: row.kind,
    description: row.description,
    accent: row.accent || '#059669',
    created_by: row.created_by,
    created_at: row.created_at,
    parent_id: row.parent_id || null,
    city: row.city || null,
    country: row.country || null,
    member_count: memberCount,
    max_members: maxMembers,
    seats_left: seatsLeft,
    is_full: seatsLeft <= 0,
    vibe: vibeOf(memberCount, maxMembers),
    pulse_count: Number(row.pulse_count) || 0,
    joined: Number(row.joined) > 0,
    role: row.role || null,
    last_pulse_at: row.last_pulse_at || null,
    last_activity_at: row.last_activity_at || null,
    calls: {
      voice_waitlist: Number(row.voice_wait) || 0,
      video_waitlist: Number(row.video_wait) || 0,
      voice_available: false,
      video_available: false,
    },
  };
}

type MappedGroup = ReturnType<typeof mapGroup>;

const GROUP_SELECT = `
  SELECT g.*,
    (SELECT COUNT(*) FROM growth_group_members m WHERE m.group_id = g.id) AS member_count,
    (SELECT COUNT(*) FROM growth_group_pulses p WHERE p.group_id = g.id) AS pulse_count,
    (SELECT COUNT(*) FROM growth_group_call_interest c WHERE c.group_id = g.id AND c.kind = 'voice') AS voice_wait,
    (SELECT COUNT(*) FROM growth_group_call_interest c WHERE c.group_id = g.id AND c.kind = 'video') AS video_wait,
    CASE WHEN mine.user_id IS NULL THEN 0 ELSE 1 END AS joined,
    mine.role AS role,
    mine.last_pulse_at AS last_pulse_at,
    (SELECT MAX(p.created_at) FROM growth_group_pulses p WHERE p.group_id = g.id) AS last_activity_at
  FROM growth_groups g
  LEFT JOIN growth_group_members mine
    ON mine.group_id = g.id AND mine.user_id = ?
`;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function nearbyScore(prefs: CirclePrefs, group: GroupRow): number {
  const gLat = asFiniteNumber(group.lat);
  const gLng = asFiniteNumber(group.lng);
  if (prefs.lat != null && prefs.lng != null && gLat != null && gLng != null) {
    const km = haversineKm(prefs.lat, prefs.lng, gLat, gLng);
    return Math.max(0, 1 - km / 400);
  }
  const cityA = (prefs.city || '').trim().toLowerCase();
  const cityB = (group.city || '').trim().toLowerCase();
  const countryA = (prefs.country || '').trim().toLowerCase();
  const countryB = (group.country || '').trim().toLowerCase();
  if (cityA && cityB && cityA === cityB && (!countryA || !countryB || countryA === countryB)) {
    return 1;
  }
  if (countryA && countryB && countryA === countryB) return 0.55;
  return 0.12;
}

function matchingScore(userCats: string[], pathKey: string): number {
  if (!pathKey || pathKey === 'grove') return 0.4;
  if (matchesPath(userCats, pathKey)) return 1;
  const parent = pathKey.includes(':') ? pathKey.split(':')[0] : pathKey;
  if (userCats.some((c) => c === parent || c.startsWith(`${parent}:`))) return 0.7;
  return 0.18;
}

/** Peak at 4–8 people: conversation-sized once a few flake, not a room of one. */
function occupancyScore(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 0.18;
  if (count === 2) return 0.32;
  if (count === 3) return 0.62;
  if (count <= 8) return 1;
  return 0.92;
}

function recencyScore(iso: string | null | undefined): number {
  if (!iso) return 0.2;
  const t = Date.parse(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (!Number.isFinite(t)) return 0.2;
  const hours = (Date.now() - t) / 36e5;
  if (hours < 12) return 1;
  if (hours < 36) return 0.7;
  if (hours < 96) return 0.45;
  return 0.2;
}

/**
 * Fill lively rooms first (anti-fragmentation). Nearby/matching are leans,
 * not a reason to sit alone in a city of one while an 8-person path room has seats.
 */
function placementScore(prefs: CirclePrefs, userCats: string[], group: GroupRow): number {
  const count = Number(group.member_count) || 0;
  const health = 0.5 * occupancyScore(count) + 0.18 * recencyScore(group.last_activity_at);
  if (prefs.match === 'random') return health + 0.45 * Math.random();
  const near = nearbyScore(prefs, group);
  const match = matchingScore(userCats, group.path_key);
  if (prefs.match === 'nearby') return health + 0.4 * near;
  if (prefs.match === 'matching') return health + 0.4 * match;
  return health + 0.22 * near + 0.22 * match;
}

function cohortName(templateName: string, n: number): string {
  const base = templateName.replace(/\s+starting circle$/i, '').trim() || templateName;
  return `${base} · ${n}`;
}

async function memberCount(env: Env, groupId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM growth_group_members WHERE group_id = ?`
  )
    .bind(groupId)
    .first<{ c: number }>();
  return Number(row?.c) || 0;
}

async function loadPrefs(env: Env, userId: string): Promise<CirclePrefs> {
  const row = await env.DB.prepare(`SELECT metadata FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ metadata: string }>();
  return parseCirclePrefs(row?.metadata);
}

async function stampGroupLocation(env: Env, groupId: string, prefs: CirclePrefs): Promise<void> {
  if (!prefs.city && !prefs.country && prefs.lat == null && prefs.lng == null) return;
  await env.DB.prepare(
    `UPDATE growth_groups
     SET city = COALESCE(city, ?),
         country = COALESCE(country, ?),
         lat = COALESCE(lat, ?),
         lng = COALESCE(lng, ?)
     WHERE id = ?`
  )
    .bind(prefs.city, prefs.country, prefs.lat, prefs.lng, groupId)
    .run();
}

const LIST_GROUPS_LIMIT = 50;

/**
 * Global circle housekeeping: drop empty user/cohort circles and split any circle
 * over MAX_CIRCLE_MEMBERS into cohorts. Both scan every group, so they run on a
 * schedule (wire into the Worker's scheduled() handler) rather than per request.
 */
export async function runGroupMaintenance(env: Env): Promise<void> {
  await pruneEmptyGroups(env);
  await rebalanceOverflow(env);
}

/** Deletes empty user/cohort circles — all of them, or just `onlyGroupId`. */
async function pruneEmptyGroups(env: Env, onlyGroupId?: string): Promise<void> {
  const empty = await env.DB.prepare(
    `SELECT g.id FROM growth_groups g
     WHERE g.kind IN ('user', 'cohort')
       ${onlyGroupId ? 'AND g.id = ?' : ''}
       AND NOT EXISTS (
         SELECT 1 FROM growth_group_members m WHERE m.group_id = g.id
       )`
  )
    .bind(...(onlyGroupId ? [onlyGroupId] : []))
    .all<{ id: string }>();
  for (const row of empty.results || []) {
    await env.DB.prepare(`DELETE FROM growth_group_pulses WHERE group_id = ?`).bind(row.id).run();
    await env.DB.prepare(`DELETE FROM growth_group_call_interest WHERE group_id = ?`)
      .bind(row.id)
      .run();
    await env.DB.prepare(`DELETE FROM growth_group_calls WHERE group_id = ?`).bind(row.id).run();
    await env.DB.prepare(`DELETE FROM growth_group_members WHERE group_id = ?`).bind(row.id).run();
    await env.DB.prepare(`DELETE FROM growth_groups WHERE id = ?`).bind(row.id).run();
  }
}

async function spawnCohort(
  env: Env,
  template: GroupRow,
  podIndex: number,
  prefs: CirclePrefs | null
): Promise<string> {
  const id = generateId('ggrp');
  await env.DB.prepare(
    `INSERT INTO growth_groups (
       id, slug, name, path_key, kind, description, accent, created_by,
       max_members, parent_id, city, country, lat, lng
     ) VALUES (?, NULL, ?, ?, 'cohort', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      cohortName(template.name, podIndex),
      template.path_key,
      template.description,
      template.accent || '#059669',
      MAX_CIRCLE_MEMBERS,
      template.id,
      prefs?.city || null,
      prefs?.country || null,
      prefs?.lat ?? null,
      prefs?.lng ?? null
    )
    .run();
  return id;
}

async function nextPodIndex(env: Env, templateId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM growth_groups WHERE id = ? OR parent_id = ?`
  )
    .bind(templateId, templateId)
    .first<{ c: number }>();
  return Math.max(2, Number(row?.c || 1) + 1);
}

async function tryJoin(
  env: Env,
  groupId: string,
  userId: string,
  role: string,
  prefs: CirclePrefs
): Promise<'ok' | 'full' | 'already'> {
  const existing = await env.DB.prepare(
    `SELECT user_id FROM growth_group_members WHERE group_id = ? AND user_id = ?`
  )
    .bind(groupId, userId)
    .first();
  if (existing) return 'already';

  const group = await env.DB.prepare(`SELECT max_members FROM growth_groups WHERE id = ?`)
    .bind(groupId)
    .first<{ max_members: number | null }>();
  if (!group) return 'full';

  const before = await memberCount(env, groupId);
  if (before >= capOf(group)) return 'full';

  await env.DB.prepare(
    `INSERT OR IGNORE INTO growth_group_members (group_id, user_id, role, joined_at)
     VALUES (?, ?, ?, datetime('now'))`
  )
    .bind(groupId, userId, role)
    .run();

  const after = await memberCount(env, groupId);
  if (after > capOf(group)) {
    await env.DB.prepare(`DELETE FROM growth_group_members WHERE group_id = ? AND user_id = ?`)
      .bind(groupId, userId)
      .run();
    return 'full';
  }

  await stampGroupLocation(env, groupId, prefs);
  return 'ok';
}

async function familyGroupId(
  env: Env,
  userId: string,
  pathKey: string
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT g.id FROM growth_groups g
     JOIN growth_group_members m ON m.group_id = g.id
     WHERE m.user_id = ? AND g.path_key = ? AND g.kind IN ('starting', 'cohort')
     LIMIT 1`
  )
    .bind(userId, pathKey)
    .first<{ id: string }>();
  return row?.id || null;
}

async function rebalanceOverflow(env: Env): Promise<void> {
  const overflowing = await env.DB.prepare(
    `SELECT g.id FROM growth_groups g
     WHERE (SELECT COUNT(*) FROM growth_group_members m WHERE m.group_id = g.id) > ${MAX_CIRCLE_MEMBERS}`
  ).all<{ id: string }>();
  if (!overflowing.results?.length) return;

  for (const { id } of overflowing.results) {
    const group = await env.DB.prepare(`SELECT * FROM growth_groups WHERE id = ?`)
      .bind(id)
      .first<GroupRow>();
    if (!group) continue;

    const members = await env.DB.prepare(
      `SELECT user_id, role, joined_at FROM growth_group_members
       WHERE group_id = ? ORDER BY joined_at ASC, user_id ASC`
    )
      .bind(id)
      .all<{ user_id: string; role: string; joined_at: string }>();
    const list = members.results || [];
    if (list.length <= MAX_CIRCLE_MEMBERS) continue;

    const overflow = list.slice(MAX_CIRCLE_MEMBERS);
    const template =
      group.kind === 'cohort' && group.parent_id
        ? (await env.DB.prepare(`SELECT * FROM growth_groups WHERE id = ?`)
            .bind(group.parent_id)
            .first<GroupRow>()) || group
        : group;

    for (let i = 0; i < overflow.length; i += MAX_CIRCLE_MEMBERS) {
      const chunk = overflow.slice(i, i + MAX_CIRCLE_MEMBERS);
      const podIndex = await nextPodIndex(env, template.id);
      const newId = await spawnCohort(env, template, podIndex, {
        match: 'mix',
        city: group.city || null,
        country: group.country || null,
        lat: asFiniteNumber(group.lat),
        lng: asFiniteNumber(group.lng),
      });
      for (let j = 0; j < chunk.length; j++) {
        const m = chunk[j];
        await env.DB.prepare(
          `INSERT OR IGNORE INTO growth_group_members (group_id, user_id, role, joined_at)
           VALUES (?, ?, ?, ?)`
        )
          .bind(newId, m.user_id, j === 0 ? 'host' : 'member', m.joined_at)
          .run();
        await env.DB.prepare(`DELETE FROM growth_group_members WHERE group_id = ? AND user_id = ?`)
          .bind(id, m.user_id)
          .run();
      }
    }
  }
}

async function fetchMappedGroup(
  env: Env,
  viewerId: string,
  groupId: string
): Promise<MappedGroup | null> {
  const row = await env.DB.prepare(`${GROUP_SELECT} WHERE g.id = ?`)
    .bind(viewerId, groupId)
    .first<GroupRow>();
  return row ? mapGroup(row) : null;
}

async function placeInPath(
  env: Env,
  userId: string,
  pathKey: string,
  userCats: string[]
): Promise<{ groupId: string; created: boolean } | { code: string; message: string; status: number }> {
  const key = pathKey.trim().toLowerCase().slice(0, 80);
  if (!key) return { code: 'INVALID_PATH', message: 'Pick a growth path', status: 400 };
  if (key !== 'grove' && !matchesPath(userCats, key)) {
    return { code: 'FORBIDDEN', message: 'This circle is for another path', status: 403 };
  }

  const template = await env.DB.prepare(
    `SELECT * FROM growth_groups WHERE kind = 'starting' AND path_key = ? ORDER BY created_at ASC LIMIT 1`
  )
    .bind(key)
    .first<GroupRow>();
  if (!template) {
    return { code: 'NOT_FOUND', message: 'No starting circle for that path', status: 404 };
  }

  const already = await familyGroupId(env, userId, key);
  if (already) return { groupId: already, created: false };

  const prefs = await loadPrefs(env, userId);

  const open = await env.DB.prepare(
    `SELECT g.*,
      (SELECT COUNT(*) FROM growth_group_members m WHERE m.group_id = g.id) AS member_count
     FROM growth_groups g
     WHERE g.path_key = ?
       AND g.kind IN ('starting', 'cohort')
       AND (g.id = ? OR g.parent_id = ?)
       AND (SELECT COUNT(*) FROM growth_group_members m WHERE m.group_id = g.id)
           BETWEEN 1 AND ?`
  )
    .bind(key, template.id, template.id, MAX_CIRCLE_MEMBERS - 1)
    .all<GroupRow>();

  const ranked = (open.results || [])
    .map((g) => ({ g, score: placementScore(prefs, userCats, g) }))
    .sort((a, b) => b.score - a.score);

  for (const { g } of ranked) {
    const result = await tryJoin(env, g.id, userId, 'member', prefs);
    if (result === 'ok' || result === 'already') return { groupId: g.id, created: false };
  }

  const templateCount = await memberCount(env, template.id);
  if (templateCount === 0) {
    const result = await tryJoin(env, template.id, userId, 'member', prefs);
    if (result === 'ok' || result === 'already') return { groupId: template.id, created: false };
  }

  const podIndex = await nextPodIndex(env, template.id);
  const newId = await spawnCohort(env, template, podIndex, prefs);
  const spawned = await tryJoin(env, newId, userId, 'host', prefs);
  if (spawned === 'full') {
    await pruneEmptyGroups(env, newId);
    return { code: 'CIRCLE_FULL', message: 'Could not open a circle just then', status: 409 };
  }
  return { groupId: newId, created: true };
}

async function ensureStartingMemberships(env: Env, userId: string, userCats: string[]) {
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM growth_group_members WHERE user_id = ?`
  )
    .bind(userId)
    .first<{ c: number }>();
  if (Number(countRow?.c) > 0) return;
  await placeInPath(env, userId, 'grove', userCats);
}

async function notifyHostOnJoin(env: Env, group: GroupRow, actorId: string) {
  if (!group.created_by || group.kind !== 'user' || group.created_by === actorId) return;
  const username = await resolveUsername(env, actorId);
  await createUserNotification(env, {
    userId: group.created_by,
    actorId,
    type: 'group_join',
    title: `${username} joined ${group.name}`,
    body: 'A new grower landed in your circle.',
    refType: 'growth_group',
    refId: group.id,
  });
}

/**
 * GET /api/v1/groups
 */
export async function listGroups(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    // Global cleanup (pruneEmptyGroups / rebalanceOverflow) runs from the cron via
    // runGroupMaintenance — not on every list request.
    const userCats = await resolveUserCategories(env, ctx.userId);
    await ensureStartingMemberships(env, ctx.userId, userCats);
    const prefs = await loadPrefs(env, ctx.userId);

    // Capped at LIST_GROUPS_LIMIT. Priority for the cap: my circles, then starting
    // templates (needed for "start in a path"), then the busiest others. The
    // response keeps the original display order (joined, kind, size, name).
    const rows = await env.DB.prepare(
      `${GROUP_SELECT}
       ORDER BY joined DESC, CASE WHEN g.kind = 'starting' THEN 0 ELSE 1 END ASC,
                member_count DESC, g.name ASC
       LIMIT ${LIST_GROUPS_LIMIT}`
    )
      .bind(ctx.userId)
      .all<GroupRow>();

    const all = (rows.results || []).slice().sort(
      (a, b) =>
        Number(b.joined || 0) - Number(a.joined || 0) ||
        String(a.kind).localeCompare(String(b.kind)) ||
        Number(b.member_count || 0) - Number(a.member_count || 0) ||
        String(a.name).localeCompare(String(b.name))
    );
    const groups = all.map(mapGroup);
    const mine = groups.filter((g) => g.joined);
    const minePath = new Set(
      mine.filter((g) => g.kind === 'starting' || g.kind === 'cohort').map((g) => g.path_key)
    );
    const templates = groups
      .filter((g) => g.kind === 'starting')
      .map((g) => ({ ...g, already_in: minePath.has(g.path_key) }));

    const suggestedRows = all
      .filter((row) => {
        const mapped = mapGroup(row);
        if (mapped.joined || mapped.is_full || mapped.member_count < 1) return false;
        if (mapped.kind === 'starting' && !matchesPath(userCats, mapped.path_key)) return false;
        return true;
      })
      .sort(
        (a, b) => placementScore(prefs, userCats, b) - placementScore(prefs, userCats, a)
      )
      .slice(0, 16)
      .map(mapGroup);

    const live = groups.filter((g) => g.joined || g.member_count > 0);

    return json({
      groups: live,
      mine,
      starting: templates,
      templates,
      suggested: suggestedRows,
      prefs,
      max_members: MAX_CIRCLE_MEMBERS,
      paths: userCats,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table') || msg.includes('no such column')) {
      return json({
        groups: [],
        mine: [],
        starting: [],
        templates: [],
        suggested: [],
        prefs: parseCirclePrefs(null),
        max_members: MAX_CIRCLE_MEMBERS,
        paths: [],
      });
    }
    console.error('[listGroups]', err);
    return error('DATABASE_ERROR', 'Failed to load circles', 500);
  }
}

/**
 * PATCH /api/v1/groups/prefs
 */
export async function updateCirclePrefs(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: {
    match?: string;
    city?: string | null;
    country?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('INVALID_BODY', 'JSON required', 400);
  }

  const current = await env.DB.prepare(`SELECT metadata FROM users WHERE id = ?`)
    .bind(ctx.userId)
    .first<{ metadata: string }>();
  if (!current) return error('USER_NOT_FOUND', 'User not found', 404);

  const prev = parseCirclePrefs(current.metadata);
  const matchRaw = body.match != null ? String(body.match) : prev.match;
  if (!MATCH_MODES.has(matchRaw as CircleMatchMode)) {
    return error('INVALID_MATCH', 'Use nearby, matching, mix, or random', 400);
  }

  const next: CirclePrefs = {
    match: matchRaw as CircleMatchMode,
    city:
      body.city === undefined
        ? prev.city
        : body.city == null
          ? null
          : String(body.city).trim().slice(0, 80) || null,
    country:
      body.country === undefined
        ? prev.country
        : body.country == null
          ? null
          : String(body.country).trim().slice(0, 80) || null,
    lat: body.lat === undefined ? prev.lat : body.lat == null ? null : asFiniteNumber(body.lat),
    lng: body.lng === undefined ? prev.lng : body.lng == null ? null : asFiniteNumber(body.lng),
  };
  if (next.lat != null) next.lat = Math.max(-90, Math.min(90, next.lat));
  if (next.lng != null) next.lng = Math.max(-180, Math.min(180, next.lng));

  const meta = parseMeta(current.metadata);
  meta.circle_prefs = next;
  await env.DB.prepare(`UPDATE users SET metadata = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(meta), ctx.userId)
    .run();

  return json({ prefs: next });
}

/**
 * POST /api/v1/groups/place
 */
export async function placeGroup(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { path_key?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('INVALID_BODY', 'JSON required', 400);
  }

  try {
    const userCats = await resolveUserCategories(env, ctx.userId);
    const placed = await placeInPath(env, ctx.userId, String(body.path_key || ''), userCats);
    if ('code' in placed) {
      return error(placed.code, placed.message, placed.status);
    }
    const group = await fetchMappedGroup(env, ctx.userId, placed.groupId);
    return json({ group, created: placed.created, placed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table') || msg.includes('no such column')) {
      return error('NOT_FOUND', 'Circles are not available yet', 404);
    }
    console.error('[placeGroup]', err);
    return error('DATABASE_ERROR', 'Failed to find a circle', 500);
  }
}

/**
 * POST /api/v1/groups
 */
export async function createGroup(request: Request, env: Env): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: { name?: string; path_key?: string; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return error('INVALID_BODY', 'JSON required', 400);
  }

  const name = String(body.name || '').trim().slice(0, 60);
  const pathKey = String(body.path_key || '').trim().toLowerCase().slice(0, 80);
  const description = String(body.description || '').trim().slice(0, 280);
  if (name.length < 2) return error('INVALID_NAME', 'Give the circle a name', 400);
  if (!pathKey) return error('INVALID_PATH', 'Pick a growth path', 400);

  const userCats = await resolveUserCategories(env, ctx.userId);
  if (!matchesPath(userCats, pathKey) && pathKey !== 'grove') {
    return error('FORBIDDEN', 'You can only start a circle on one of your paths', 403);
  }

  const prefs = await loadPrefs(env, ctx.userId);
  const id = generateId('ggrp');
  try {
    await env.DB.prepare(
      `INSERT INTO growth_groups (
         id, slug, name, path_key, kind, description, accent, created_by,
         max_members, parent_id, city, country, lat, lng
       ) VALUES (?, NULL, ?, ?, 'user', ?, '#059669', ?, ?, NULL, ?, ?, ?, ?)`
    )
      .bind(
        id,
        name,
        pathKey,
        description || null,
        ctx.userId,
        MAX_CIRCLE_MEMBERS,
        prefs.city,
        prefs.country,
        prefs.lat,
        prefs.lng
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO growth_group_members (group_id, user_id, role, joined_at)
       VALUES (?, ?, 'host', datetime('now'))`
    )
      .bind(id, ctx.userId)
      .run();

    const group = await fetchMappedGroup(env, ctx.userId, id);
    return json({ group: group || { id, name, path_key: pathKey } }, 201);
  } catch (err) {
    console.error('[createGroup]', err);
    return error('DATABASE_ERROR', 'Failed to create circle', 500);
  }
}

/**
 * GET /api/v1/groups/:id
 */
export async function getGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const row = await env.DB.prepare(`${GROUP_SELECT} WHERE g.id = ?`)
      .bind(ctx.userId, groupId)
      .first<GroupRow>();
    if (!row) return error('NOT_FOUND', 'Circle not found', 404);

    // Member list, pulse notes and call interest are for members only;
    // everyone else gets the circle summary.
    if (!Number(row.joined)) {
      return json({
        group: mapGroup(row),
        members: [],
        pulses: [],
        my_call_interest: [],
        prefs: await loadPrefs(env, ctx.userId),
      });
    }

    const members = await env.DB.prepare(
      `SELECT m.user_id, m.role, m.joined_at, m.last_pulse_at, u.metadata
       FROM growth_group_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY m.role DESC, m.joined_at ASC
       LIMIT 12`
    )
      .bind(groupId)
      .all<{
        user_id: string;
        role: string;
        joined_at: string;
        last_pulse_at: string | null;
        metadata: string | null;
      }>();

    const pulses = await env.DB.prepare(
      `SELECT p.id, p.user_id, p.note, p.created_at, u.metadata
       FROM growth_group_pulses p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.group_id = ?
       ORDER BY p.created_at DESC
       LIMIT 24`
    )
      .bind(groupId)
      .all<{
        id: string;
        user_id: string;
        note: string | null;
        created_at: string;
        metadata: string | null;
      }>();

    const myInterest = await env.DB.prepare(
      `SELECT kind FROM growth_group_call_interest WHERE group_id = ? AND user_id = ?`
    )
      .bind(groupId, ctx.userId)
      .all<{ kind: string }>();

    const parseMemberMeta = (raw: string | null) => {
      const m = parseMeta(raw);
      return {
        username: typeof m.username === 'string' ? m.username : 'Grower',
        avatar: typeof m.avatar === 'string' ? m.avatar : null,
      };
    };

    return json({
      group: mapGroup(row),
      members: (members.results || []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        last_pulse_at: m.last_pulse_at,
        ...parseMemberMeta(m.metadata),
      })),
      pulses: (pulses.results || []).map((p) => ({
        id: p.id,
        user_id: p.user_id,
        note: p.note,
        created_at: p.created_at,
        ...parseMemberMeta(p.metadata),
      })),
      my_call_interest: (myInterest.results || []).map((r) => r.kind),
      prefs: await loadPrefs(env, ctx.userId),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such table')) return error('NOT_FOUND', 'Circle not found', 404);
    console.error('[getGroup]', err);
    return error('DATABASE_ERROR', 'Failed to load circle', 500);
  }
}

/**
 * POST /api/v1/groups/:id/join
 */
export async function joinGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const group = await env.DB.prepare(`SELECT * FROM growth_groups WHERE id = ?`)
      .bind(groupId)
      .first<GroupRow>();
    if (!group) return error('NOT_FOUND', 'Circle not found', 404);

    const userCats = await resolveUserCategories(env, ctx.userId);
    if (
      (group.kind === 'starting' || group.kind === 'cohort') &&
      !matchesPath(userCats, group.path_key)
    ) {
      return error('FORBIDDEN', 'This starting circle is for another path', 403);
    }

    const family = await familyGroupId(env, ctx.userId, group.path_key);
    if (
      family &&
      family !== groupId &&
      (group.kind === 'starting' || group.kind === 'cohort')
    ) {
      const existing = await fetchMappedGroup(env, ctx.userId, family);
      return json({ ok: true, group: existing, placed: false, already: true });
    }

    const prefs = await loadPrefs(env, ctx.userId);
    const result = await tryJoin(env, groupId, ctx.userId, 'member', prefs);
    if (result === 'already') {
      const mapped = await fetchMappedGroup(env, ctx.userId, groupId);
      return json({ ok: true, group: mapped, placed: false, already: true });
    }

    if (result === 'full') {
      if (group.kind === 'starting' || group.kind === 'cohort') {
        const placed = await placeInPath(env, ctx.userId, group.path_key, userCats);
        if ('code' in placed) return error(placed.code, placed.message, placed.status);
        const mapped = await fetchMappedGroup(env, ctx.userId, placed.groupId);
        return json({ ok: true, group: mapped, created: placed.created, placed: true });
      }
      return error('CIRCLE_FULL', 'This circle is full (10 growers). Find another, or start one.', 409);
    }

    await notifyHostOnJoin(env, group, ctx.userId);
    const mapped = await fetchMappedGroup(env, ctx.userId, groupId);
    return json({ ok: true, group: mapped, placed: false });
  } catch (err) {
    console.error('[joinGroup]', err);
    return error('DATABASE_ERROR', 'Failed to join circle', 500);
  }
}

/**
 * POST /api/v1/groups/:id/leave
 */
export async function leaveGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  try {
    const group = await env.DB.prepare(`SELECT id, kind FROM growth_groups WHERE id = ?`)
      .bind(groupId)
      .first<{ id: string; kind: string }>();
    if (!group) return error('NOT_FOUND', 'Circle not found', 404);

    await env.DB.prepare(`DELETE FROM growth_group_members WHERE group_id = ? AND user_id = ?`)
      .bind(groupId, ctx.userId)
      .run();

    const remaining = await env.DB.prepare(
      `SELECT user_id FROM growth_group_members WHERE group_id = ? ORDER BY joined_at ASC LIMIT 1`
    )
      .bind(groupId)
      .first<{ user_id: string }>();

    let closed = false;
    if (!remaining) {
      if (group.kind === 'user' || group.kind === 'cohort') {
        await env.DB.prepare(`DELETE FROM growth_group_pulses WHERE group_id = ?`).bind(groupId).run();
        await env.DB.prepare(`DELETE FROM growth_group_call_interest WHERE group_id = ?`)
          .bind(groupId)
          .run();
        await env.DB.prepare(`DELETE FROM growth_group_calls WHERE group_id = ?`).bind(groupId).run();
        await env.DB.prepare(`DELETE FROM growth_groups WHERE id = ?`).bind(groupId).run();
        closed = true;
      }
    } else {
      const host = await env.DB.prepare(
        `SELECT user_id FROM growth_group_members WHERE group_id = ? AND role = 'host' LIMIT 1`
      )
        .bind(groupId)
        .first();
      if (!host) {
        await env.DB.prepare(
          `UPDATE growth_group_members SET role = 'host' WHERE group_id = ? AND user_id = ?`
        )
          .bind(groupId, remaining.user_id)
          .run();
      }
    }

    return json({ ok: true, closed });
  } catch (err) {
    console.error('[leaveGroup]', err);
    return error('DATABASE_ERROR', 'Failed to leave circle', 500);
  }
}

/**
 * POST /api/v1/groups/:id/pulse
 */
export async function pulseGroup(request: Request, env: Env, groupId: string): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let note: string | null = null;
  try {
    const body = (await request.json()) as { note?: string };
    note = typeof body?.note === 'string' ? body.note.trim().slice(0, 140) || null : null;
  } catch {
    /* optional body */
  }

  try {
    const member = await env.DB.prepare(
      `SELECT user_id, last_pulse_at FROM growth_group_members WHERE group_id = ? AND user_id = ?`
    )
      .bind(groupId, ctx.userId)
      .first<{ user_id: string; last_pulse_at: string | null }>();
    if (!member) return error('FORBIDDEN', 'Join the circle first', 403);

    if (member.last_pulse_at) {
      const last = Date.parse(member.last_pulse_at.replace(' ', 'T') + 'Z');
      if (Number.isFinite(last) && Date.now() - last < 8 * 60 * 1000) {
        return error('RATE_LIMIT', 'Pulse again in a few minutes', 429);
      }
    }

    await env.DB.prepare(
      `INSERT INTO growth_group_pulses (id, group_id, user_id, note, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
      .bind(generateId('gpulse'), groupId, ctx.userId, note)
      .run();
    await env.DB.prepare(
      `UPDATE growth_group_members SET last_pulse_at = datetime('now')
       WHERE group_id = ? AND user_id = ?`
    )
      .bind(groupId, ctx.userId)
      .run();

    return json({ ok: true });
  } catch (err) {
    console.error('[pulseGroup]', err);
    return error('DATABASE_ERROR', 'Failed to pulse', 500);
  }
}

/**
 * POST /api/v1/groups/:id/call-interest
 * Waitlist for future voice / video rooms (LiveKit).
 */
export async function callInterest(
  request: Request,
  env: Env,
  groupId: string
): Promise<Response> {
  const ctx = await getRequestContext(request, env);
  if (!ctx.isAuthenticated || !ctx.userId) {
    return error('UNAUTHORIZED', 'Authentication required', 401);
  }

  let kind = 'voice';
  try {
    const body = (await request.json()) as { kind?: string };
    kind = body?.kind === 'video' ? 'video' : 'voice';
  } catch {
    /* default voice */
  }

  try {
    const member = await env.DB.prepare(
      `SELECT user_id FROM growth_group_members WHERE group_id = ? AND user_id = ?`
    )
      .bind(groupId, ctx.userId)
      .first();
    if (!member) return error('FORBIDDEN', 'Join the circle first', 403);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO growth_group_call_interest (group_id, user_id, kind, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
      .bind(groupId, ctx.userId, kind)
      .run();

    return json({ ok: true, kind });
  } catch (err) {
    console.error('[callInterest]', err);
    return error('DATABASE_ERROR', 'Failed to save interest', 500);
  }
}
