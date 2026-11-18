import type { Env } from '../../types';
import * as buddies from './buddies';
import * as insights from './insights';
import * as search from './search';
import * as mentions from './mentions';
import * as social from './social';
import * as bizx from './bizx';
import * as coachx from './coachx';
import * as userx from './userx';
import * as proofx from './proofx';
import * as coachq from './coachq';
import * as weekly from './weekly';
import * as cohorts from './cohorts';
import * as storefront from './storefront';
import * as bizinsights from './bizinsights';
import * as bizengage from './bizengage';

/** Wave 3 modules, tried in order before the router's 404. Each owns its own paths. */
const MODULES = [buddies, insights, search, mentions, social, bizx, coachx, userx, proofx, coachq, weekly, cohorts, storefront, bizinsights, bizengage];

/** Modules with hourly cron work (each guards its own cadence, e.g. Monday-only). */
const CRON_MODULES = [proofx, coachq, weekly, cohorts, storefront, bizinsights, bizengage];

export async function runWave3Cron(env: Env, now = new Date()): Promise<void> {
  for (const m of CRON_MODULES) {
    try {
      await m.runCron(env, now);
    } catch (err) {
      console.error('[cron] wave module', err);
    }
  }
}

export async function handleWave3(
  request: Request,
  env: Env,
  path: string,
  apiPrefix: string,
): Promise<Response | null> {
  for (const m of MODULES) {
    const res = await m.handle(request, env, path, apiPrefix);
    if (res) return res;
  }
  return null;
}
