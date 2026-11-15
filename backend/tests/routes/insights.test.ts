/**
 * Wave 3 insights: pure computeInsights thresholds/edge cases, plus GET /me/insights
 * against an in-memory SQLite built from every migration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../../src/index';
import type { Env } from '../../src/types';
import { createSqliteD1, loadMigrationsSql, trackParams } from '../utils/sqliteD1';
import { signAccessToken } from '../../src/utils/jwt';
import { addDays } from '../../src/utils/days';
import {
  computeInsights,
  localHourOf,
  timeOfDay,
  INSIGHT_THRESHOLDS,
  type InsightCheckin,
  type InsightInput,
} from '../../src/routes/wave3/insights';

const TODAY = '2026-11-15'; // a Sunday

function ck(daysAgo: number, mood: number | null, extra: Partial<InsightCheckin> = {}): InsightCheckin {
  return {
    day: addDays(TODAY, -daysAgo),
    mood,
    path: null,
    intention: null,
    rest: false,
    followup: null,
    ...extra,
  };
}

function input(checkins: InsightCheckin[], extra: Partial<InsightInput> = {}): InsightInput {
  return { today: TODAY, days: 30, checkins, activity: [], events: [], ...extra };
}

const kinds = (r: ReturnType<typeof computeInsights>) => r.insights.map((i) => i.kind);
const find = (r: ReturnType<typeof computeInsights>, kind: string) => r.insights.find((i) => i.kind === kind);

describe('computeInsights: readiness', () => {
  it('is not ready below 7 mood check-ins and reports how many are needed', () => {
    const r = computeInsights(input([0, 1, 2].map((d) => ck(d, 4))));
    expect(r).toMatchObject({ ready: false, checkins_needed: 4, insights: [] });
  });

  it('ignores rest days, moodless rows and rows outside the window', () => {
    const rows = [
      ...[0, 1, 2, 3, 4, 5].map((d) => ck(d, 4)),
      ck(6, null),
      ck(7, 3, { rest: true }),
      ck(40, 5),
    ];
    expect(computeInsights(input(rows)).checkins_needed).toBe(1);
    expect(computeInsights(input([...rows, ck(8, 3)])).ready).toBe(true);
  });

  it('a flat, uniform mood history yields no insights', () => {
    const r = computeInsights(input(Array.from({ length: 30 }, (_, d) => ck(d, 3))));
    expect(r.ready).toBe(true);
    expect(r.insights).toEqual([]);
  });
});

describe('computeInsights: mood_by_path', () => {
  // Use day offsets that spread over weekdays evenly and keep halves balanced for trend.
  const fitnessDays = [0, 3, 6, 9, 15, 18, 21, 24];
  const otherDays = [1, 4, 7, 10, 16, 19, 22, 25];

  it('finds a brighter path with ≥ 4 samples each side and diff ≥ 0.5', () => {
    const rows = [
      ...fitnessDays.slice(0, 4).map((d) => ck(d, 4, { path: 'fitness:cardio' })),
      ...otherDays.slice(0, 4).map((d) => ck(d, 3, { path: 'art' })),
    ];
    const r = computeInsights(input(rows));
    const ins = find(r, 'mood_by_path')!;
    expect(ins).toBeTruthy();
    expect(ins.id).toBe('mood_by_path:fitness');
    expect(ins.title).toBe('You tend to feel brighter on Fitness days');
    expect(ins.strength).toBe('tentative');
    expect(ins.data).toMatchObject({ path: 'fitness', path_samples: 4, other_samples: 4, diff: 1 });
  });

  it('needs 4 samples on each side', () => {
    const rows = [
      ...fitnessDays.slice(0, 3).map((d) => ck(d, 5, { path: 'fitness' })),
      ...otherDays.map((d) => ck(d, 3)),
    ];
    expect(find(computeInsights(input(rows)), 'mood_by_path')).toBeUndefined();
  });

  it('needs a mean difference of at least 0.5', () => {
    // fitness mean 3.25, others 3.0 → 0.25
    const rows = [
      ...fitnessDays.slice(0, 4).map((d, i) => ck(d, i === 0 ? 4 : 3, { path: 'fitness' })),
      ...otherDays.slice(0, 4).map((d) => ck(d, 3)),
    ];
    expect(find(computeInsights(input(rows)), 'mood_by_path')).toBeUndefined();
  });

  it('never reports a heavier path (negative direction)', () => {
    const rows = [
      ...fitnessDays.slice(0, 4).map((d) => ck(d, 2, { path: 'fitness' })),
      ...otherDays.slice(0, 4).map((d) => ck(d, 4)),
    ];
    expect(find(computeInsights(input(rows)), 'mood_by_path')).toBeUndefined();
  });

  it('is "clear" with ≥ 8 samples each side and diff ≥ 0.75', () => {
    const rows = [
      ...fitnessDays.map((d) => ck(d, 5, { path: 'fitness' })),
      ...otherDays.map((d) => ck(d, 4)),
    ];
    expect(find(computeInsights(input(rows)), 'mood_by_path')?.strength).toBe('clear');
  });
});

describe('computeInsights: mood_trend', () => {
  it('reports lifting mood when the last 2 weeks are ≥ 0.5 brighter than the prior 2', () => {
    const rows = [...[0, 2, 4, 6].map((d) => ck(d, 4)), ...[15, 17, 19, 21].map((d) => ck(d, 3))];
    const ins = find(computeInsights(input(rows)), 'mood_trend')!;
    expect(ins.id).toBe('mood_trend:up');
    expect(ins.data).toMatchObject({ direction: 'up', recent_samples: 4, prior_samples: 4 });
  });

  it('words a heavier stretch gently', () => {
    const rows = [...[0, 2, 4, 6].map((d) => ck(d, 2)), ...[15, 17, 19, 21].map((d) => ck(d, 4))];
    const ins = find(computeInsights(input(rows)), 'mood_trend')!;
    expect(ins.id).toBe('mood_trend:down');
    expect(ins.title).toMatch(/a little heavier/);
    expect(ins.body).not.toMatch(/depress|anxi|disorder|should|fail/i);
  });

  it('stays quiet with fewer than 4 samples in either half', () => {
    const rows = [...[0, 1, 2, 3, 4].map((d) => ck(d, 5)), ...[15, 17, 19].map((d) => ck(d, 2))];
    expect(find(computeInsights(input(rows)), 'mood_trend')).toBeUndefined();
  });
});

describe('computeInsights: mood_by_weekday', () => {
  it('names the brightest and heaviest weekday with ≥ 3 samples each', () => {
    // TODAY is Sunday. Saturdays = 1, 8, 15 days ago; Mondays = 6, 13, 20 days ago.
    const rows = [...[1, 8, 15].map((d) => ck(d, 5)), ...[6, 13, 20].map((d) => ck(d, 3)), ck(3, 4)];
    const ins = find(computeInsights(input(rows)), 'mood_by_weekday')!;
    expect(ins.title).toBe('Saturdays tend to feel brightest');
    expect(ins.body).toMatch(/^Mondays tend to be a little heavier/);
    expect(ins.id).toBe('mood_by_weekday:6:1');
    expect(ins.strength).toBe('tentative');
  });

  it('skips weekdays with fewer than 3 samples', () => {
    const rows = [...[1, 8].map((d) => ck(d, 5)), ...[6, 13].map((d) => ck(d, 1)), ...[2, 3, 4].map((d) => ck(d, 3))];
    expect(find(computeInsights(input(rows)), 'mood_by_weekday')).toBeUndefined();
  });
});

describe('computeInsights: intention_follow_through', () => {
  const base = Array.from({ length: 7 }, (_, d) => ck(d, 3));

  it('celebrates intentions that mostly stick (≥ 5 answered, ≥ 50% followed)', () => {
    const rows = base.map((c, i) => ({
      ...c,
      intention: 'walk',
      followup: (i < 3 ? 'yes' : i < 4 ? 'partly' : i < 6 ? 'no' : null) as InsightCheckin['followup'],
    }));
    const ins = find(computeInsights(input(rows)), 'intention_follow_through')!;
    expect(ins.data).toMatchObject({ answered: 6, followed: 4 });
    expect(ins.strength).toBe('tentative');
  });

  it('says nothing when follow-through is low (no negative judgement)', () => {
    const rows = base.map((c, i) => ({
      ...c,
      intention: 'walk',
      followup: (i < 1 ? 'yes' : 'no') as InsightCheckin['followup'],
    }));
    expect(find(computeInsights(input(rows)), 'intention_follow_through')).toBeUndefined();
  });

  it('needs 5 answered intentions', () => {
    const rows = base.map((c, i) => ({ ...c, intention: 'x', followup: (i < 4 ? 'yes' : null) as InsightCheckin['followup'] }));
    expect(find(computeInsights(input(rows)), 'intention_follow_through')).toBeUndefined();
  });
});

describe('computeInsights: activity, rest and consistency', () => {
  it('mood_by_activity compares post/journal days to quiet days', () => {
    const rows = Array.from({ length: 8 }, (_, d) => ck(d * 3, d % 2 === 0 ? 4 : 3));
    const activity = rows.filter((_, i) => i % 2 === 0).map((c) => ({ day: c.day, kinds: 4, is_rest: false }));
    const ins = find(computeInsights(input(rows, { activity })), 'mood_by_activity');
    expect(ins?.data).toMatchObject({ active_samples: 4, other_samples: 4 });
  });

  it('rest_bounce: brighter the day after a rest day', () => {
    const rows: InsightCheckin[] = [];
    for (const r of [1, 6, 11, 16]) {
      rows.push(ck(r, null, { rest: true }), ck(r - 1, 5), ck(r + 2, 3));
    }
    const ins = find(computeInsights(input(rows)), 'rest_bounce');
    expect(ins?.data).toMatchObject({ after_rest_samples: 4, other_samples: 4 });
  });

  it('consistency: steadiest path and usual time of day', () => {
    const rows = Array.from({ length: 8 }, (_, d) => ck(d, 3, { path: d < 5 ? 'coding' : 'art' }));
    const events = Array.from({ length: 6 }, () => ({ kind: 'post' as const, path: 'coding', hour: 19 }));
    const ins = find(computeInsights(input(rows, { events })), 'consistency')!;
    expect(ins.title).toBe('Coding has been your steadiest path lately');
    expect(ins.body).toMatch(/in the evening/);
    expect(ins.data).toMatchObject({ path: 'coding', path_count: 11, time_of_day: 'evening' });
  });

  it('consistency stays quiet when paths are evenly split', () => {
    const rows = Array.from({ length: 8 }, (_, d) => ck(d, 3, { path: d % 2 ? 'coding' : 'art' }));
    expect(find(computeInsights(input(rows)), 'consistency')).toBeUndefined();
  });

  it('returns at most 3 insights, most meaningful first', () => {
    const rows: InsightCheckin[] = [];
    for (let d = 0; d < 28; d++) {
      const recent = d < 14;
      const fitness = d % 2 === 0;
      rows.push(ck(d, (recent ? 4 : 3) + (fitness ? 1 : 0) - (d % 7 === 6 ? 1 : 0), { path: fitness ? 'fitness' : 'art', intention: 'x', followup: 'yes' }));
    }
    const r = computeInsights(input(rows));
    expect(r.insights.length).toBe(INSIGHT_THRESHOLDS.MAX_INSIGHTS);
    expect(kinds(r)[0]).toBe('mood_by_path');
    expect(new Set(r.insights.map((i) => i.id)).size).toBe(r.insights.length);
    for (const i of r.insights) expect(i.title + i.body).toMatch(/tend|lately|little|lifting|steadiest|stick/);
  });
});

describe('helpers', () => {
  it('timeOfDay buckets', () => {
    expect([5, 11, 12, 16, 17, 21, 22, 2].map(timeOfDay)).toEqual([
      'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night',
    ]);
  });
  it('localHourOf converts DB timestamps to the user zone', () => {
    expect(localHourOf('2026-11-15 18:30:00', 'UTC')).toBe(18);
    expect(localHourOf('2026-11-15 18:30:00', 'Europe/Luxembourg')).toBe(19);
    expect(localHourOf(null, 'UTC')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
const SCHEMA = loadMigrationsSql();
let db: ReturnType<typeof createSqliteD1>['raw'];
let env: Env;
let stats: { maxParams: number; maxSql: string };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

async function call(userId: string | null, method: string, path: string) {
  const h: Record<string, string> = {};
  if (userId) h.Authorization = `Bearer ${await signAccessToken(userId, env)}`;
  const res = await worker.fetch(new Request(`https://api.test/api/v1${path}`, { method, headers: h }), env, ctx);
  const body = (await res.json()) as any;
  return { status: res.status, body, data: body.data };
}

describe('GET /me/insights', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
    const sqlite = createSqliteD1(SCHEMA);
    db = sqlite.raw;
    const tracked = trackParams(sqlite.d1);
    stats = tracked.stats;
    env = {
      DB: tracked.d1 as any,
      KV: { get: async () => null, put: async () => {}, delete: async () => {} } as any,
      ENVIRONMENT: 'test',
      JWT_SECRET: 'insights-test-secret',
      API_VERSION: 'v1',
    } as Env;
    db.prepare(
      `INSERT INTO users (id, email, password_hash, metadata, email_verified, timezone, created_at, updated_at)
       VALUES ('u', 'u@example.com', 'x', '{"username":"u"}', 1, 'UTC', datetime('now'), datetime('now'))`
    ).run();
  });

  afterEach(() => {
    expect(stats.maxParams, stats.maxSql).toBeLessThanOrEqual(100);
    vi.useRealTimers();
  });

  function addCheckin(daysAgo: number, mood: number, path: string | null) {
    const day = addDays(TODAY, -daysAgo);
    db.prepare(
      `INSERT INTO daily_checkins (id, user_id, day, mood, path, rest) VALUES (?, 'u', ?, ?, ?, 0)`
    ).run(`c${daysAgo}`, day, mood, path);
  }

  it('requires auth', async () => {
    expect((await call(null, 'GET', '/me/insights')).status).toBe(401);
  });

  it('reports not-ready with check-ins needed', async () => {
    addCheckin(0, 4, null);
    addCheckin(1, 4, null);
    const r = await call('u', 'GET', '/me/insights');
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ ready: false, checkins_needed: 5, days: 30, insights: [] });
  });

  it('computes insights from stored check-ins and posts', async () => {
    for (const d of [0, 3, 6, 9]) addCheckin(d, 5, 'fitness');
    for (const d of [1, 4, 7, 10]) addCheckin(d, 3, 'art');
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO posts (id, user_id, category, created_at, updated_at) VALUES (?, 'u', 'fitness', '2026-11-14 19:00:00', '2026-11-14 19:00:00')`
      ).run(`p${i}`);
    }
    const r = await call('u', 'GET', '/me/insights?days=90');
    expect(r.status).toBe(200);
    expect(r.data.ready).toBe(true);
    expect(r.data.days).toBe(90);
    expect(r.data.insights[0]).toMatchObject({ kind: 'mood_by_path', id: 'mood_by_path:fitness' });
    expect(r.data.insights.find((i: any) => i.kind === 'consistency')?.data.path).toBe('fitness');
  });

  it('rejects non-GET', async () => {
    expect((await call('u', 'POST', '/me/insights')).status).toBe(405);
  });
});
