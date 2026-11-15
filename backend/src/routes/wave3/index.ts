import type { Env } from '../../types';
import * as buddies from './buddies';
import * as insights from './insights';
import * as search from './search';
import * as mentions from './mentions';
import * as social from './social';

/** Wave 3 modules, tried in order before the router's 404. Each owns its own paths. */
const MODULES = [buddies, insights, search, mentions, social];

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
