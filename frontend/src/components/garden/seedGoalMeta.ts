/**
 * Goal essence schemas — structured metrics per subcategory.
 * Only paths on the user's growth profile can be planted; these add numbers + evidence.
 */

export type SeedMetricKind =
  | 'weight'
  | 'minutes'
  | 'reps'
  | 'pages'
  | 'sessions'
  | 'custom';

export type SeedGoalSchema = {
  kind: SeedMetricKind;
  unit: string;
  unitLabel: string;
  startLabel: string;
  targetLabel: string;
  checkInLabel: string;
  /** Photo evidence required on every check-in */
  requirePhoto: boolean;
  hint: string;
};

const WEIGHT: SeedGoalSchema = {
  kind: 'weight',
  unit: 'kg',
  unitLabel: 'kg',
  startLabel: 'Current weight',
  targetLabel: 'Goal weight',
  checkInLabel: 'Today’s weight',
  requirePhoto: true,
  hint: 'Scale selfie or mirror photo counts as evidence.',
};

const MINUTES: SeedGoalSchema = {
  kind: 'minutes',
  unit: 'min',
  unitLabel: 'min',
  startLabel: 'Starting weekly minutes',
  targetLabel: 'Goal weekly minutes',
  checkInLabel: 'Minutes this session',
  requirePhoto: true,
  hint: 'Snap your watch, app, or session proof.',
};

const REPS: SeedGoalSchema = {
  kind: 'reps',
  unit: 'reps',
  unitLabel: 'reps',
  startLabel: 'Current best',
  targetLabel: 'Target',
  checkInLabel: 'Today’s number',
  requirePhoto: true,
  hint: 'Photo of form or gym proof keeps it honest.',
};

const PAGES: SeedGoalSchema = {
  kind: 'pages',
  unit: 'pages',
  unitLabel: 'pages',
  startLabel: 'Pages so far',
  targetLabel: 'Goal pages',
  checkInLabel: 'Pages today',
  requirePhoto: false,
  hint: 'Optional photo of the page or notes.',
};

const SESSIONS: SeedGoalSchema = {
  kind: 'sessions',
  unit: 'sessions',
  unitLabel: 'sessions',
  startLabel: 'Sessions done',
  targetLabel: 'Sessions goal',
  checkInLabel: 'Sessions this check-in',
  requirePhoto: false,
  hint: 'Add a quick note or photo of your practice.',
};

/** Map subcategory key → metric schema */
const BY_SUB: Record<string, SeedGoalSchema> = {
  'losing-weight': WEIGHT,
  'weight-management': WEIGHT,
  'building-muscle': {
    ...WEIGHT,
    startLabel: 'Current weight',
    targetLabel: 'Target weight',
    hint: 'Progress photo + weight keeps muscle goals grounded.',
  },
  cardio: MINUTES,
  flexibility: MINUTES,
  strength: REPS,
  piano: MINUTES,
  violin: MINUTES,
  guitar: MINUTES,
  drawing: SESSIONS,
  painting: SESSIONS,
  photography: SESSIONS,
  'meal-planning': SESSIONS,
  'healthy-eating': SESSIONS,
  cooking: SESSIONS,
  'positive-thinking': SESSIONS,
  'stress-management': MINUTES,
  'self-confidence': SESSIONS,
  'time-management': SESSIONS,
  'habit-building': SESSIONS,
  productivity: MINUTES,
  'goal-setting': SESSIONS,
  karate: MINUTES,
  'jiu-jitsu': MINUTES,
  boxing: MINUTES,
  taekwondo: MINUTES,
  reading: PAGES,
  writing: PAGES,
  meditation: MINUTES,
  yoga: MINUTES,
  running: MINUTES,
  swimming: MINUTES,
};

export function goalSchemaFor(subcategoryKey: string): SeedGoalSchema | null {
  return BY_SUB[subcategoryKey] || null;
}

/** Default generic schema when subcategory has no specialty but still wants numbers */
export function fallbackGoalSchema(): SeedGoalSchema {
  return {
    kind: 'custom',
    unit: 'pts',
    unitLabel: '',
    startLabel: 'Starting point',
    targetLabel: 'Goal',
    checkInLabel: 'Today’s number',
    requirePhoto: false,
    hint: 'Track a number that proves progress for this goal.',
  };
}

export function daysSincePlanted(plantedAt: string | null | undefined): number {
  if (!plantedAt) return 0;
  const t = new Date(plantedAt).getTime();
  if (Number.isNaN(t)) return 0;
  const ms = Date.now() - t;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function metricProgress(start: number | null, target: number | null, current: number | null): number | null {
  if (start == null || target == null || current == null) return null;
  if (start === target) return current === target ? 1 : 0;
  // Works for both lose (start > target) and gain (start < target)
  const total = target - start;
  const done = current - start;
  return Math.max(0, Math.min(1, done / total));
}
