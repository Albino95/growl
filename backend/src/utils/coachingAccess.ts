import type { Env } from '../types';

export type InstructorOffering = {
  instructor_id: string;
  weekly_fee_eur: number;
  sessions_per_week: number;
  typical_weeks: number;
  trial_days: number;
  currency: string;
  accepting: boolean;
  updated_at: string;
};

export type CoachingChannel = {
  inquiry_id: string | null;
  proposal_id: string | null;
  contract_id: string | null;
  conversation_id: string | null;
  instructor_id: string | null;
  client_id: string | null;
};

const DEFAULT_OFFERING = {
  weekly_fee_eur: 10,
  sessions_per_week: 3,
  typical_weeks: 2,
  trial_days: 0,
  currency: 'EUR',
  accepting: true,
};

export function clampOfferingInput(input: {
  weekly_fee_eur?: number;
  sessions_per_week?: number;
  typical_weeks?: number;
  trial_days?: number;
  accepting?: boolean;
}) {
  const weekly = Number(input.weekly_fee_eur);
  const sessions = Number(input.sessions_per_week);
  const weeks = Number(input.typical_weeks);
  const trial = Number(input.trial_days);
  return {
    weekly_fee_eur: Number.isFinite(weekly) ? Math.min(500, Math.max(1, Math.round(weekly * 100) / 100)) : 10,
    sessions_per_week: Number.isFinite(sessions) ? Math.min(7, Math.max(1, Math.floor(sessions))) : 3,
    typical_weeks: Number.isFinite(weeks) ? Math.min(26, Math.max(1, Math.floor(weeks))) : 2,
    trial_days: Number.isFinite(trial) ? Math.min(14, Math.max(0, Math.floor(trial))) : 0,
    accepting: input.accepting === false ? 0 : 1,
  };
}

export function mapOffering(row: {
  instructor_id: string;
  weekly_fee_eur: number;
  sessions_per_week: number;
  typical_weeks: number;
  trial_days: number;
  currency: string;
  accepting: number;
  updated_at: string;
} | null): InstructorOffering | null {
  if (!row) return null;
  return {
    instructor_id: row.instructor_id,
    weekly_fee_eur: Number(row.weekly_fee_eur) || 0,
    sessions_per_week: Number(row.sessions_per_week) || 1,
    typical_weeks: Number(row.typical_weeks) || 1,
    trial_days: Number(row.trial_days) || 0,
    currency: row.currency || 'EUR',
    accepting: !!row.accepting,
    updated_at: row.updated_at,
  };
}

export async function getOffering(
  env: Env,
  instructorId: string
): Promise<InstructorOffering | null> {
  try {
    const row = await env.DB.prepare(`SELECT * FROM instructor_offerings WHERE instructor_id = ?`)
      .bind(instructorId)
      .first<{
        instructor_id: string;
        weekly_fee_eur: number;
        sessions_per_week: number;
        typical_weeks: number;
        trial_days: number;
        currency: string;
        accepting: number;
        updated_at: string;
      }>();
    return mapOffering(row);
  } catch {
    return null;
  }
}

export async function ensureOffering(env: Env, instructorId: string): Promise<InstructorOffering> {
  const existing = await getOffering(env, instructorId);
  if (existing) return existing;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO instructor_offerings
        (instructor_id, weekly_fee_eur, sessions_per_week, typical_weeks, trial_days, currency, accepting, updated_at)
       VALUES (?, ?, ?, ?, ?, 'EUR', 1, ?)`
    )
      .bind(
        instructorId,
        DEFAULT_OFFERING.weekly_fee_eur,
        DEFAULT_OFFERING.sessions_per_week,
        DEFAULT_OFFERING.typical_weeks,
        DEFAULT_OFFERING.trial_days,
        now
      )
      .run();
  } catch {
    /* table may not exist yet */
  }
  return (
    (await getOffering(env, instructorId)) || {
      instructor_id: instructorId,
      ...DEFAULT_OFFERING,
      updated_at: now,
    }
  );
}

export async function countCompletedPlans(env: Env, instructorId: string): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM coaching_contracts WHERE instructor_id = ? AND status = 'completed'`
    )
      .bind(instructorId)
      .first<{ n: number }>();
    return Number(row?.n) || 0;
  } catch {
    return 0;
  }
}

export async function loadOfferingsMap(
  env: Env,
  instructorIds: string[]
): Promise<Map<string, InstructorOffering>> {
  const map = new Map<string, InstructorOffering>();
  if (instructorIds.length === 0) return map;
  try {
    const placeholders = instructorIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT * FROM instructor_offerings WHERE instructor_id IN (${placeholders})`
    )
      .bind(...instructorIds)
      .all<{
        instructor_id: string;
        weekly_fee_eur: number;
        sessions_per_week: number;
        typical_weeks: number;
        trial_days: number;
        currency: string;
        accepting: number;
        updated_at: string;
      }>();
    for (const row of rows.results || []) {
      const mapped = mapOffering(row);
      if (mapped) map.set(mapped.instructor_id, mapped);
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function loadCompletedPlansMap(
  env: Env,
  instructorIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (instructorIds.length === 0) return map;
  try {
    const placeholders = instructorIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT instructor_id, COUNT(*) AS n
       FROM coaching_contracts
       WHERE instructor_id IN (${placeholders}) AND status = 'completed'
       GROUP BY instructor_id`
    )
      .bind(...instructorIds)
      .all<{ instructor_id: string; n: number }>();
    for (const row of rows.results || []) {
      map.set(row.instructor_id, Number(row.n) || 0);
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function getCoachingChannel(
  env: Env,
  userId: string,
  peerId: string
): Promise<CoachingChannel | null> {
  try {
    const row = await env.DB.prepare(
      `SELECT
        (SELECT id FROM coaching_inquiries
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
            AND status IN ('pending', 'talking')
          LIMIT 1) AS inquiry_id,
        (SELECT conversation_id FROM coaching_inquiries
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
          ORDER BY updated_at DESC LIMIT 1) AS conversation_id,
        (SELECT instructor_id FROM coaching_inquiries
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
          ORDER BY updated_at DESC LIMIT 1) AS instructor_id,
        (SELECT client_id FROM coaching_inquiries
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
          ORDER BY updated_at DESC LIMIT 1) AS client_id,
        (SELECT id FROM coaching_proposals
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
            AND status = 'sent'
          ORDER BY created_at DESC LIMIT 1) AS proposal_id,
        (SELECT id FROM coaching_contracts
          WHERE ((instructor_id = ? AND client_id = ?) OR (instructor_id = ? AND client_id = ?))
            AND status = 'active'
          ORDER BY started_at DESC LIMIT 1) AS contract_id`
    )
      .bind(
        userId, peerId, peerId, userId,
        userId, peerId, peerId, userId,
        userId, peerId, peerId, userId,
        userId, peerId, peerId, userId,
        userId, peerId, peerId, userId,
        userId, peerId, peerId, userId
      )
      .first<CoachingChannel>();
    if (!row) return null;
    if (!row.inquiry_id && !row.proposal_id && !row.contract_id) return null;
    return row;
  } catch {
    return null;
  }
}

export async function hasCoachingChannel(env: Env, userId: string, peerId: string): Promise<boolean> {
  const channel = await getCoachingChannel(env, userId, peerId);
  return !!(channel?.inquiry_id || channel?.proposal_id || channel?.contract_id);
}

export async function coachingConversationIds(env: Env, userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const rows = await env.DB.prepare(
      `SELECT conversation_id FROM coaching_inquiries
       WHERE (instructor_id = ? OR client_id = ?)
         AND conversation_id IS NOT NULL
         AND (
           status IN ('pending', 'talking')
           OR EXISTS (
             SELECT 1 FROM coaching_proposals p
             WHERE p.inquiry_id = coaching_inquiries.id AND p.status = 'sent'
           )
           OR EXISTS (
             SELECT 1 FROM coaching_contracts c
             WHERE c.inquiry_id = coaching_inquiries.id AND c.status = 'active'
           )
         )`
    )
      .bind(userId, userId)
      .all<{ conversation_id: string }>();
    for (const row of rows.results || []) {
      if (row.conversation_id) ids.add(row.conversation_id);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function proposalTotal(weeks: number, weeklyFee: number): number {
  return Math.round(weeks * weeklyFee * 100) / 100;
}

export const REVIEW_MIN_WEEKS = 4;

export async function completedWeeksTogether(
  env: Env,
  instructorId: string,
  clientId: string
): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(weeks), 0) AS weeks
       FROM coaching_contracts
       WHERE instructor_id = ? AND client_id = ? AND status = 'completed'`
    )
      .bind(instructorId, clientId)
      .first<{ weeks: number }>();
    return Number(row?.weeks) || 0;
  } catch {
    return 0;
  }
}

export async function loadInstructorRatings(
  env: Env,
  instructorIds: string[]
): Promise<Map<string, { avg: number; count: number }>> {
  const map = new Map<string, { avg: number; count: number }>();
  if (instructorIds.length === 0) return map;
  try {
    const placeholders = instructorIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT instructor_id, AVG(stars) AS avg, COUNT(*) AS n
       FROM coaching_reviews
       WHERE instructor_id IN (${placeholders}) AND direction = 'client_to_instructor'
       GROUP BY instructor_id`
    )
      .bind(...instructorIds)
      .all<{ instructor_id: string; avg: number; n: number }>();
    for (const row of rows.results || []) {
      map.set(row.instructor_id, {
        avg: Math.round((Number(row.avg) || 0) * 10) / 10,
        count: Number(row.n) || 0,
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}

export async function loadClientFollowThrough(
  env: Env,
  clientId: string
): Promise<{ avg: number; count: number }> {
  try {
    const row = await env.DB.prepare(
      `SELECT AVG(follow_through) AS avg, COUNT(*) AS n
       FROM coaching_reviews
       WHERE client_id = ? AND direction = 'instructor_to_client' AND follow_through IS NOT NULL`
    )
      .bind(clientId)
      .first<{ avg: number; n: number }>();
    return {
      avg: Math.round((Number(row?.avg) || 0) * 10) / 10,
      count: Number(row?.n) || 0,
    };
  } catch {
    return { avg: 0, count: 0 };
  }
}
