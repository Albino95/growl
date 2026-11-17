/**
 * Pure proof helpers (no React Native imports → unit-tested in proofDefaults.test.ts):
 * per-path proof suggestions and number units, focus-timer math and voice limits.
 */
import type { ProofKind } from '../../services/api/proofs';

export const ALL_PROOF_KINDS: ProofKind[] = ['photo', 'timer', 'number', 'note', 'voice'];
/** One line (matches the server's cap). */
export const PROOF_NOTE_MAX = 140;

/** Each path suggests its best proof first (docs/PROOF_AND_COACHING_PLAN.md). */
const PATH_KINDS: Record<string, ProofKind[]> = {
  fitness: ['photo', 'number'],
  'martial-arts': ['photo', 'number'],
  language: ['timer', 'voice'],
  mindset: ['timer', 'note'],
  wellness: ['timer', 'note'],
  finance: ['number', 'note'],
  art: ['photo', 'timer'],
  nutrition: ['photo', 'note'],
};
const DEFAULT_KINDS: ProofKind[] = ['note', 'photo'];

/** Top-level path key from a stored path (`fitness:cardio` → `fitness`). */
export function pathRoot(path: string | null | undefined): string | null {
  if (!path) return null;
  const root = path.split(':')[0].trim().toLowerCase();
  return root || null;
}

/** The two suggested kinds for a path. */
export function suggestedKinds(path: string | null | undefined): ProofKind[] {
  const root = pathRoot(path);
  return (root && PATH_KINDS[root]) || DEFAULT_KINDS;
}

/**
 * Kinds to offer, suggestions first then the rest, limited to `allowed`
 * (when given). A `requested` kind (e.g. homework asking for a photo) goes first.
 */
export function orderedKinds(
  path: string | null | undefined,
  allowed?: ProofKind[] | null,
  requested?: ProofKind | null
): ProofKind[] {
  const allow = allowed && allowed.length ? new Set(allowed) : null;
  const out: ProofKind[] = [];
  const push = (k: ProofKind) => {
    if ((!allow || allow.has(k)) && !out.includes(k)) out.push(k);
  };
  if (requested) push(requested);
  suggestedKinds(path).forEach(push);
  ALL_PROOF_KINDS.forEach(push);
  return out;
}

/** The kind a fresh sheet opens on. */
export function defaultKind(
  path: string | null | undefined,
  allowed?: ProofKind[] | null,
  requested?: ProofKind | null
): ProofKind {
  return orderedKinds(path, allowed, requested)[0] ?? 'note';
}

const PATH_UNITS: Record<string, string[]> = {
  fitness: ['reps', 'km', 'min'],
  'martial-arts': ['rounds', 'min', 'reps'],
  language: ['min', 'words', 'pages'],
  mindset: ['min', 'pages'],
  wellness: ['min', 'glasses'],
  finance: ['€'],
  art: ['min', 'pieces', 'pages'],
  nutrition: ['meals', 'glasses'],
  coding: ['min', 'tasks'],
};
const DEFAULT_UNITS = ['min', 'pages', 'reps'];

/** Unit chips for the number proof; first is the default. */
export function unitsForPath(path: string | null | undefined): string[] {
  const root = pathRoot(path);
  return (root && PATH_UNITS[root]) || DEFAULT_UNITS;
}

/** Parse a typed number ("12,5" → 12.5). null when not a finite number. */
export function parseProofNumber(raw: string): number | null {
  const t = raw.replace(/\s/g, '').replace(',', '.');
  if (!t || !/^-?\d*(\.\d+)?$/.test(t) || t === '-' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= 1e9 ? n : null;
}

export const KIND_META: Record<ProofKind, { label: string; emoji: string; icon: string }> = {
  photo: { label: 'Photo', emoji: '📷', icon: 'camera-outline' },
  timer: { label: 'Timer', emoji: '⏱', icon: 'timer-outline' },
  number: { label: 'Number', emoji: '🔢', icon: 'stats-chart-outline' },
  note: { label: 'Note', emoji: '✏️', icon: 'create-outline' },
  voice: { label: 'Voice', emoji: '🎙', icon: 'mic-outline' },
};

/** Short human summary of a proof ("20 min", "5 km", "“Ran in the rain”"). */
export function proofSummary(p: {
  kind: ProofKind;
  text?: string | null;
  number?: number | null;
  unit?: string | null;
  minutes?: number | null;
  duration_s?: number | null;
}): string {
  switch (p.kind) {
    case 'timer':
      return p.minutes ? `${p.minutes} min focused` : 'Focus time';
    case 'number':
      return p.number != null ? `${formatNumber(p.number)}${p.unit ? ` ${p.unit}` : ''}` : 'A number';
    case 'voice':
      return p.duration_s ? `Voice note · ${p.duration_s}s` : 'Voice note';
    case 'photo':
      return p.text ? p.text : 'Photo';
    default:
      return p.text ? `“${p.text}”` : 'Note';
  }
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// ---------------------------------------------------------------------------
// Focus timer — timestamp based, so it keeps counting while the app is in the
// background (nothing ticks off-screen; elapsed time is derived from Date.now()).

export type FocusTimerState = {
  /** Epoch ms when the current run started; null while paused / idle. */
  startedAt: number | null;
  /** Time banked from earlier runs (ms). */
  accumulatedMs: number;
};

export const IDLE_TIMER: FocusTimerState = { startedAt: null, accumulatedMs: 0 };
/** A focus session shorter than this isn't saved as minutes. */
export const MIN_FOCUS_MS = 30_000;
export const MAX_FOCUS_MINUTES = 720;

export function timerRunning(s: FocusTimerState): boolean {
  return s.startedAt != null;
}

export function timerElapsedMs(s: FocusTimerState, now: number): number {
  const live = s.startedAt != null ? Math.max(0, now - s.startedAt) : 0;
  return Math.max(0, s.accumulatedMs + live);
}

export function startTimer(s: FocusTimerState, now: number): FocusTimerState {
  return s.startedAt != null ? s : { startedAt: now, accumulatedMs: s.accumulatedMs };
}

export function pauseTimer(s: FocusTimerState, now: number): FocusTimerState {
  return s.startedAt == null ? s : { startedAt: null, accumulatedMs: timerElapsedMs(s, now) };
}

/** Minutes to save: rounded, at least 1 once past 30 s, 0 below that, capped at 12 h. */
export function focusMinutes(ms: number): number {
  if (!Number.isFinite(ms) || ms < MIN_FOCUS_MS) return 0;
  return Math.min(MAX_FOCUS_MINUTES, Math.max(1, Math.round(ms / 60_000)));
}

/** "4:05", "1:02:09". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------------------------------------------------------------------------
// Voice note limits

export const VOICE_MIN_S = 10;
export const VOICE_MAX_S = 60;

/** Whole seconds to save for a recording of `ms`, clamped to 60. */
export function voiceSeconds(ms: number): number {
  return Math.min(VOICE_MAX_S, Math.max(0, Math.round(ms / 1000)));
}

export function voiceLongEnough(ms: number): boolean {
  return ms >= VOICE_MIN_S * 1000 - 250;
}

/** Day key (local) a skipped "Add proof?" row is remembered for. */
export function proofSkipActive(skippedDay: string | null | undefined, today: string): boolean {
  return !!skippedDay && skippedDay === today;
}
