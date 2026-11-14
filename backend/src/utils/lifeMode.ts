/**
 * Life mode (sick / travel / break): while active, missed days neither break the
 * growth streak nor consume rest days. Stored on users (migration 0036):
 * life_mode, life_mode_since (local day it started), life_mode_until (last protected
 * local day, NULL = open-ended).
 */
import { addDays } from './days';

export const LIFE_MODES = ['none', 'sick', 'travel', 'break'] as const;
export type LifeMode = (typeof LIFE_MODES)[number];
export const LIFE_MODE_MAX_DAYS_AHEAD = 30;

export type LifeModeState = { mode: LifeMode; since: string | null; until: string | null };
export type LifeModePayload = { mode: LifeMode; until: string | null };

export const NO_LIFE_MODE: LifeModeState = { mode: 'none', since: null, until: null };

export function parseLifeMode(raw: { life_mode?: unknown; life_mode_since?: unknown; life_mode_until?: unknown } | null | undefined): LifeModeState {
  const mode = (LIFE_MODES as readonly string[]).includes(String(raw?.life_mode)) ? (raw!.life_mode as LifeMode) : 'none';
  if (mode === 'none') return NO_LIFE_MODE;
  return {
    mode,
    since: typeof raw?.life_mode_since === 'string' && raw.life_mode_since ? raw.life_mode_since : null,
    until: typeof raw?.life_mode_until === 'string' && raw.life_mode_until ? raw.life_mode_until : null,
  };
}

/** True when `day` falls inside the stored life-mode window. */
export function isLifeModeDay(state: LifeModeState, day: string): boolean {
  if (state.mode === 'none') return false;
  if (state.since && day < state.since) return false;
  if (state.until && day > state.until) return false;
  return true;
}

/** Public shape; an expired mode reads as 'none'. */
export function lifeModePayload(state: LifeModeState, today: string): LifeModePayload {
  if (state.mode === 'none' || (state.until && today > state.until)) return { mode: 'none', until: null };
  return { mode: state.mode, until: state.until };
}

export function maxLifeModeUntil(today: string): string {
  return addDays(today, LIFE_MODE_MAX_DAYS_AHEAD);
}
