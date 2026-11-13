/**
 * Pure haptics logic (no React Native / asset imports) so it can be unit-tested:
 * channels, per-channel debounce, the celebrate signature, and the
 * "celebrate once ever" registry. `interactionFeedback.ts` wires it to
 * expo-haptics; `haptics.ts` is the public moment-based API.
 */

/** What the device actually does. */
export type HapticChannel =
  | 'none'
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'soft'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error'
  | 'celebrate';

/** Minimum gap between two fires of the same debounce group (ms). */
export const HAPTIC_DEBOUNCE_MS = {
  selection: 50,
  light: 120,
  medium: 120,
  /** success + error (outcomes). */
  notification: 800,
  /** Own group so a destructive-confirm warning never swallows the success after it. */
  warning: 800,
  celebrate: 4000,
} as const;

export type DebounceGroup = keyof typeof HAPTIC_DEBOUNCE_MS;

export function debounceGroupFor(channel: HapticChannel): DebounceGroup | null {
  switch (channel) {
    case 'none':
      return null;
    case 'selection':
      return 'selection';
    case 'impactLight':
    case 'soft':
      return 'light';
    case 'impactMedium':
    case 'impactHeavy':
    case 'rigid':
      return 'medium';
    case 'success':
    case 'error':
      return 'notification';
    case 'warning':
      return 'warning';
    case 'celebrate':
      return 'celebrate';
    default:
      return null;
  }
}

/**
 * Per-group throttle: the first call fires, repeats inside the window are
 * dropped (a burst of likes or a fast scrub yields one tick per window).
 */
export function createHapticGate(now: () => number = () => Date.now()) {
  const last = new Map<DebounceGroup, number>();
  return {
    /** True when `channel` may fire now; records the fire. */
    allow(channel: HapticChannel): boolean {
      const group = debounceGroupFor(channel);
      if (!group) return false;
      const t = now();
      const prev = last.get(group);
      if (prev != null && t - prev < HAPTIC_DEBOUNCE_MS[group]) return false;
      last.set(group, t);
      return true;
    },
    reset() {
      last.clear();
    },
  };
}

/** Minimal slice of expo-haptics the engine needs (lets tests pass a mock). */
export type HapticsModule = {
  impactAsync: (style: never) => Promise<void>;
  notificationAsync: (type: never) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: Record<string, unknown>;
  NotificationFeedbackType: Record<string, unknown>;
};

/** One step of a multi-tap haptic pattern. */
export type HapticStep = { at: number; channel: Exclude<HapticChannel, 'celebrate' | 'none'> };

export type HapticSequenceName = 'checkin' | 'celebrate' | 'likeDoubleTap';

/**
 * Multi-step patterns (ms offsets). Played with setTimeout, cancel-safe, and
 * every step re-checks the haptics pref (see runHapticSequence).
 */
export const HAPTIC_SEQUENCES: Record<HapticSequenceName, readonly HapticStep[]> = {
  /** Check-in: soft → medium → success (with bloom at 0). */
  checkin: [
    { at: 0, channel: 'soft' },
    { at: 90, channel: 'impactMedium' },
    { at: 220, channel: 'success' },
  ],
  /** Milestone: a building roll that lands on success (with rise). */
  celebrate: [
    { at: 0, channel: 'impactLight' },
    { at: 80, channel: 'impactLight' },
    { at: 160, channel: 'impactMedium' },
    { at: 260, channel: 'impactHeavy' },
    { at: 420, channel: 'success' },
  ],
  /** Double-tap like: crisp rigid, then a soft settle. */
  likeDoubleTap: [
    { at: 0, channel: 'rigid' },
    { at: 70, channel: 'soft' },
  ],
};

/** Milestone signature (kept for older imports). */
export const CELEBRATE_SIGNATURE: readonly HapticStep[] = HAPTIC_SEQUENCES.celebrate;

export type SequenceTimers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimers: SequenceTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Plays `steps` through `play`: the step at 0 fires synchronously, the rest
 * on timers. `enabled()` is checked before every step (haptics switched off
 * mid-pattern → the remaining steps are skipped). Returns a cancel function.
 */
export function runHapticSequence(
  steps: readonly HapticStep[],
  play: (channel: HapticStep['channel']) => void,
  opts: { enabled?: () => boolean; timers?: SequenceTimers } = {}
): () => void {
  const enabled = opts.enabled ?? (() => true);
  const timers = opts.timers ?? defaultTimers;
  const handles: unknown[] = [];
  let cancelled = false;
  const fire = (channel: HapticStep['channel']) => {
    if (cancelled || !enabled()) return;
    try {
      play(channel);
    } catch {
      /* ignore */
    }
  };
  if (!enabled()) return () => undefined;
  for (const step of steps) {
    if (step.at <= 0) fire(step.channel);
    else handles.push(timers.set(() => fire(step.channel), step.at));
  }
  return () => {
    cancelled = true;
    for (const h of handles) timers.clear(h);
    handles.length = 0;
  };
}

/**
 * Play a channel on an expo-haptics-shaped module. Returns false when it could
 * not be played (caller may fall back to Vibration).
 */
export async function playHapticChannel(
  H: HapticsModule,
  channel: HapticChannel,
  schedule: (fn: () => void, ms: number) => void = (fn, ms) => {
    setTimeout(fn, ms);
  }
): Promise<boolean> {
  const impact = (name: string, fallback: string) =>
    H.impactAsync((H.ImpactFeedbackStyle[name] ?? H.ImpactFeedbackStyle[fallback]) as never);
  const notify = (name: string) => H.notificationAsync(H.NotificationFeedbackType[name] as never);
  try {
    switch (channel) {
      case 'none':
        return true;
      case 'selection':
        await H.selectionAsync();
        return true;
      case 'impactLight':
        await impact('Light', 'Light');
        return true;
      case 'impactMedium':
        await impact('Medium', 'Medium');
        return true;
      case 'impactHeavy':
        await impact('Heavy', 'Medium');
        return true;
      case 'soft':
        await impact('Soft', 'Light');
        return true;
      case 'rigid':
        await impact('Rigid', 'Medium');
        return true;
      case 'success':
        await notify('Success');
        return true;
      case 'warning':
        await notify('Warning');
        return true;
      case 'error':
        await notify('Error');
        return true;
      case 'celebrate':
        for (const step of CELEBRATE_SIGNATURE) {
          if (step.at === 0) await playHapticChannel(H, step.channel, schedule);
          else schedule(() => void playHapticChannel(H, step.channel, schedule), step.at);
        }
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

/** Ids kept (newest last). SecureStore values should stay well under 2KB. */
export const ONCE_REGISTRY_MAX = 80;

/**
 * Persisted set of event ids that already celebrated. `claim(id)` resolves
 * true exactly once per id, ever (across launches, via `storage`).
 * Concurrent claims for the same id are serialised.
 */
export function createOnceRegistry(storage: KeyValueStorage, key: string, max = ONCE_REGISTRY_MAX) {
  let cache: string[] | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  async function load(): Promise<string[]> {
    if (cache) return cache;
    try {
      const raw = await storage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function claim(id: string): Promise<boolean> {
    const run = chain.then(async () => {
      if (!id) return false;
      const ids = await load();
      if (ids.includes(id)) return false;
      const next = [...ids, id].slice(-max);
      cache = next;
      try {
        await storage.setItem(key, JSON.stringify(next));
      } catch {
        /* still celebrated this session */
      }
      return true;
    });
    chain = run.catch(() => undefined);
    return run;
  }

  async function has(id: string): Promise<boolean> {
    await chain;
    return (await load()).includes(id);
  }

  return { claim, has };
}

// ---------------------------------------------------------------------------
// Feedback kinds → haptic channel + UI sound (pure table, unit-tested)
// ---------------------------------------------------------------------------

/**
 * The five Grow! signature sounds (assets/sounds/*.wav, one F-major-pentatonic
 * kalimba family): check-in, milestone, shared, send, error.
 */
export type SoundKey = 'bloom' | 'rise' | 'seedpop' | 'send' | 'softError';

export const SOUND_KEYS: readonly SoundKey[] = ['bloom', 'rise', 'seedpop', 'send', 'softError'];

/**
 * Tap sounds — the quiet tier under the signature set (assets/sounds/tap-*.wav,
 * 3 rendered variants each, mastered 10–20 dB under the signature peak).
 */
export type TapSoundKey =
  | 'tapToggleOn'
  | 'tapToggleOff'
  | 'tapTab'
  | 'tapChip'
  | 'tapCommit'
  | 'tapLike'
  | 'tapRefresh';

export const TAP_SOUND_KEYS: readonly TapSoundKey[] = [
  'tapToggleOn',
  'tapToggleOff',
  'tapTab',
  'tapChip',
  'tapCommit',
  'tapLike',
  'tapRefresh',
];

/** Rendered variants per tap sound (tap-<name>-1..3.wav). */
export const TAP_SOUND_VARIANTS = 3;

export type UiSoundKey = SoundKey | TapSoundKey;

export function isTapSound(key: UiSoundKey): key is TapSoundKey {
  return (TAP_SOUND_KEYS as readonly string[]).includes(key);
}

// ---------------------------------------------------------------------------
// Sound level (Settings → Sounds: Off / Subtle / Full)
// ---------------------------------------------------------------------------

export type SoundLevel = 'off' | 'subtle' | 'full';

export const SOUND_LEVELS: readonly SoundLevel[] = ['off', 'subtle', 'full'];

export const DEFAULT_SOUND_LEVEL: SoundLevel = 'subtle';

export function isSoundLevel(v: unknown): v is SoundLevel {
  return v === 'off' || v === 'subtle' || v === 'full';
}

/**
 * Lowest level at which each sound plays. Subtle = the five signature sounds
 * + like, toggle and commit. Full adds tab, chip and refresh.
 */
export const SOUND_MIN_LEVEL: Record<UiSoundKey, Exclude<SoundLevel, 'off'>> = {
  bloom: 'subtle',
  rise: 'subtle',
  seedpop: 'subtle',
  send: 'subtle',
  softError: 'subtle',
  tapLike: 'subtle',
  tapToggleOn: 'subtle',
  tapToggleOff: 'subtle',
  tapCommit: 'subtle',
  tapTab: 'full',
  tapChip: 'full',
  tapRefresh: 'full',
};

export function soundAllowed(level: SoundLevel, key: UiSoundKey): boolean {
  if (level === 'off') return false;
  if (level === 'full') return true;
  return SOUND_MIN_LEVEL[key] === 'subtle';
}

/**
 * Persisted UI prefs migration. v1 stored `soundEnabled: boolean`; v2 stores
 * `soundLevel`. false → 'off', true / missing → 'subtle'.
 */
export function migrateUiPrefs(persisted: unknown, version: number): Record<string, unknown> {
  const s: Record<string, unknown> =
    persisted && typeof persisted === 'object' ? { ...(persisted as Record<string, unknown>) } : {};
  if (version < 2 || !isSoundLevel(s.soundLevel)) {
    if (!isSoundLevel(s.soundLevel)) {
      s.soundLevel = s.soundEnabled === false ? 'off' : DEFAULT_SOUND_LEVEL;
    }
    delete s.soundEnabled;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Tap sound rate limit + variant picking
// ---------------------------------------------------------------------------

/** Tap sounds that share a rate-limit class (toggle on/off are one control). */
export const TAP_SOUND_CLASS: Record<TapSoundKey, string> = {
  tapToggleOn: 'toggle',
  tapToggleOff: 'toggle',
  tapTab: 'tab',
  tapChip: 'chip',
  tapCommit: 'commit',
  tapLike: 'like',
  tapRefresh: 'refresh',
};

/** Tap sounds inside these windows are dropped, never queued. */
export const TAP_RATE_LIMIT_MS = { perClass: 90, global: 50 } as const;

/**
 * Drop-not-queue limiter for tap sounds: 90 ms per class, 50 ms across all tap
 * classes. Signature sounds never go through it.
 */
export function createTapSoundLimiter(now: () => number = () => Date.now()) {
  const lastByClass = new Map<string, number>();
  let lastAny: number | null = null;
  return {
    allow(key: TapSoundKey): boolean {
      const t = now();
      const cls = TAP_SOUND_CLASS[key] ?? key;
      const prev = lastByClass.get(cls);
      if (prev != null && t - prev < TAP_RATE_LIMIT_MS.perClass) return false;
      if (lastAny != null && t - lastAny < TAP_RATE_LIMIT_MS.global) return false;
      lastByClass.set(cls, t);
      lastAny = t;
      return true;
    },
    reset() {
      lastByClass.clear();
      lastAny = null;
    },
  };
}

/** Picks a random variant index (0-based) per key, never the same one twice in a row. */
export function createVariantPicker(count: number = TAP_SOUND_VARIANTS, random: () => number = Math.random) {
  const last = new Map<string, number>();
  return {
    next(key: string): number {
      if (count <= 1) return 0;
      const prev = last.get(key);
      let i = Math.min(count - 1, Math.floor(random() * count));
      if (prev != null && i === prev) {
        // Shift to one of the other variants (uniform over the remaining ones).
        const offset = 1 + Math.min(count - 2, Math.floor(random() * (count - 1)));
        i = (prev + offset) % count;
      }
      last.set(key, i);
      return i;
    },
  };
}

/** ±1.5 dB random gain (as a linear multiplier) so repeated taps never sound stamped. */
export const TAP_GAIN_JITTER_DB = 1.5;

export function tapGainJitter(random: () => number = Math.random): number {
  const db = (random() * 2 - 1) * TAP_GAIN_JITTER_DB;
  return Math.pow(10, db / 20);
}

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type FeedbackKind =
  // Channel kinds (preferred; see src/theme/haptics.ts for the moment API)
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  // Signature moments (haptic + sound)
  | 'checkin'
  | 'shared'
  // Tap tier (haptic + quiet tap sound, gated by Settings → Sounds level)
  | 'toggleOn'
  | 'toggleOff'
  | 'chip'
  | 'refreshThreshold'
  | 'refreshDone'
  | 'likeDoubleTap'
  | 'longPressIn'
  | 'peekOpen'
  | 'destructive'
  | 'sheetSnap'
  // Legacy kinds — still accepted, mapped onto the calm system below
  | 'tap'
  | 'select'
  | 'tab'
  | 'like'
  | 'unlike'
  | 'open'
  | 'close'
  | 'success'
  | 'send'
  | 'toggle'
  | 'warn'
  | 'error'
  | 'delete'
  | 'refresh'
  | 'transition'
  | 'egg'
  | 'celebrate'
  | 'filter'
  | 'autoLook'
  | 'commit'
  | 'bloom';

/** Web Audio fallback: a short sequence of soft sine plucks approximating the WAV. */
export type WebNote = { at: number; f: number; ms: number; vol?: number };

export type FeedbackConfig = {
  /** Single haptic (also the debounce group for a sequence). */
  haptic: HapticChannel;
  /** Multi-step pattern played instead of `haptic` when present. */
  sequence?: HapticSequenceName;
  /** Vibration pattern (ms) used only when expo-haptics is unavailable. */
  vibrate?: number | number[];
  sound?: UiSoundKey;
};

/** Web approximations of the WAVs (same notes, same timing). */
export const WEB_SOUND_NOTES: Record<UiSoundKey, WebNote[]> = {
  bloom: [
    { at: 0, f: 880, ms: 260, vol: 0.03 },
    { at: 60, f: 1046.5, ms: 290, vol: 0.034 },
  ],
  rise: [
    { at: 0, f: 698.46, ms: 420, vol: 0.026 },
    { at: 90, f: 880, ms: 450, vol: 0.03 },
    { at: 180, f: 1046.5, ms: 620, vol: 0.034 },
    { at: 182, f: 1396.91, ms: 520, vol: 0.008 },
  ],
  seedpop: [{ at: 8, f: 1046.5, ms: 110, vol: 0.032 }],
  send: [{ at: 0, f: 783.99, ms: 60, vol: 0.017 }],
  softError: [
    { at: 0, f: 293.66, ms: 140, vol: 0.016 },
    { at: 75, f: 261.63, ms: 160, vol: 0.016 },
  ],
  // Tap tier: same levels relative to the signature set as the WAVs.
  tapToggleOn: [{ at: 0, f: 1046.5, ms: 45, vol: 0.011 }],
  tapToggleOff: [{ at: 0, f: 880, ms: 45, vol: 0.009 }],
  tapTab: [{ at: 0, f: 698.46, ms: 35, vol: 0.007 }],
  tapChip: [{ at: 0, f: 783.99, ms: 35, vol: 0.007 }],
  tapCommit: [{ at: 2, f: 1174.66, ms: 60, vol: 0.013 }],
  tapLike: [
    { at: 0, f: 880, ms: 70, vol: 0.012 },
    { at: 25, f: 1174.66, ms: 95, vol: 0.017 },
  ],
  tapRefresh: [{ at: 0, f: 523.25, ms: 50, vol: 0.007 }],
};

/** Web fallback extras: a band-passed noise click before the notes. */
export const WEB_SOUND_CLICK: Partial<Record<UiSoundKey, { hz: number; ms: number; vol: number }>> = {
  seedpop: { hz: 1800, ms: 15, vol: 0.02 },
  tapCommit: { hz: 3000, ms: 3, vol: 0.012 },
};

/** Web fallback lowpass per sound (default 6 kHz / taps 5.5 kHz). */
export function webLowpassHz(key: UiSoundKey): number {
  if (key === 'softError') return 1500;
  if (key === 'tapTab') return 2500;
  return isTapSound(key) ? 5500 : 6000;
}

/**
 * Frequency rules: the more often something happens, the quieter it is.
 * selection → tabs/chips/segments/switches; impactLight → state-changing
 * taps; impactMedium → record/long-press/drag thresholds; impactHeavy →
 * destructive confirm; notification types → outcomes. Generic `tap` is silent.
 *
 * Signature sounds: check-in (bloom), celebrate (rise), shared (seedpop),
 * send (send tick), error (soft-error). Tap sounds (gated by the Sounds
 * level): like, toggle on/off, commit (Subtle+); tab, chip, refresh (Full).
 * Plain `success` is haptic-only.
 */
export const FEEDBACK_KINDS: Record<FeedbackKind, FeedbackConfig> = {
  selection: { haptic: 'selection', vibrate: 8 },
  impactLight: { haptic: 'impactLight', vibrate: 10 },
  impactMedium: { haptic: 'impactMedium', vibrate: 16 },

  checkin: { haptic: 'success', sequence: 'checkin', vibrate: [0, 10, 30, 16], sound: 'bloom' },
  shared: { haptic: 'success', vibrate: [0, 10, 30, 16], sound: 'seedpop' },

  toggleOn: { haptic: 'selection', vibrate: 8, sound: 'tapToggleOn' },
  toggleOff: { haptic: 'selection', vibrate: 8, sound: 'tapToggleOff' },
  chip: { haptic: 'selection', vibrate: 8, sound: 'tapChip' },
  tab: { haptic: 'selection', vibrate: 8, sound: 'tapTab' },
  commit: { haptic: 'impactLight', vibrate: 10, sound: 'tapCommit' },
  like: { haptic: 'soft', vibrate: 10, sound: 'tapLike' },
  unlike: { haptic: 'impactLight', vibrate: 8 },
  likeDoubleTap: { haptic: 'rigid', sequence: 'likeDoubleTap', vibrate: [0, 12, 50, 8], sound: 'tapLike' },
  refreshThreshold: { haptic: 'rigid', vibrate: 12, sound: 'tapRefresh' },
  refreshDone: { haptic: 'impactLight', vibrate: 8 },
  longPressIn: { haptic: 'soft', vibrate: 6 },
  peekOpen: { haptic: 'impactMedium', vibrate: 16 },
  destructive: { haptic: 'impactHeavy', vibrate: [0, 24, 30, 18] },
  sheetSnap: { haptic: 'soft', vibrate: 6 },

  tap: { haptic: 'none' },
  select: { haptic: 'selection', vibrate: 8 },
  toggle: { haptic: 'selection', vibrate: 8 },
  filter: { haptic: 'selection', vibrate: 8 },
  transition: { haptic: 'selection', vibrate: 8 },
  close: { haptic: 'selection', vibrate: 8 },
  open: { haptic: 'impactLight', vibrate: 10 },
  refresh: { haptic: 'impactLight', vibrate: 10 },
  autoLook: { haptic: 'impactLight', vibrate: 10 },
  egg: { haptic: 'rigid', vibrate: [0, 8, 36, 12] },
  send: { haptic: 'impactLight', vibrate: 10, sound: 'send' },
  success: { haptic: 'success', vibrate: [0, 10, 30, 16] },
  warn: { haptic: 'warning', vibrate: [0, 20, 40, 20] },
  delete: { haptic: 'warning', vibrate: [0, 18, 35, 22] },
  error: { haptic: 'error', vibrate: [0, 28, 50, 28], sound: 'softError' },
  celebrate: {
    haptic: 'celebrate',
    sequence: 'celebrate',
    vibrate: [0, 10, 70, 10, 70, 16, 84, 24, 136, 16],
    sound: 'rise',
  },
  /** App-open splash — the seed smiles. One soft tap, deliberately silent. */
  bloom: { haptic: 'soft', vibrate: 6 },
};

export function feedbackConfig(kind: FeedbackKind): FeedbackConfig {
  return FEEDBACK_KINDS[kind] || FEEDBACK_KINDS.tap;
}

// ---------------------------------------------------------------------------
// Waiting for persisted prefs
// ---------------------------------------------------------------------------

/** How long an early haptic waits for persisted prefs before firing with defaults. */
export const PREFS_HYDRATION_WAIT_MS = 400;

export type ReadinessSource = {
  isReady: () => boolean;
  /** Subscribe; returns an unsubscribe function. */
  onReady: (cb: () => void) => () => void;
};

/**
 * Runs `cb` exactly once: immediately when `source` is ready, when it becomes
 * ready, or after `timeoutMs` — whichever comes first. A slow or failed
 * rehydration therefore never drops feedback; it fires with the defaults.
 */
export function runWhenReady(
  source: ReadinessSource,
  cb: () => void,
  timeoutMs: number = PREFS_HYDRATION_WAIT_MS,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
): void {
  if (source.isReady()) {
    cb();
    return;
  }
  let settled = false;
  let unsub: (() => void) | null = null;
  let timer: unknown = null;
  const finish = () => {
    if (settled) return;
    settled = true;
    if (timer != null) timers.clear(timer);
    unsub?.();
    cb();
  };
  unsub = source.onReady(finish);
  if (settled) {
    unsub();
    return;
  }
  timer = timers.set(finish, timeoutMs);
}

// ---------------------------------------------------------------------------
// Public moments (src/theme/haptics.ts) → feedback kinds
// ---------------------------------------------------------------------------

export type HapticMoment =
  | 'selection'
  | 'tapLight'
  | 'impactMedium'
  | 'success'
  | 'checkin'
  | 'shared'
  | 'send'
  | 'warning'
  | 'error'
  | 'celebrate'
  // Tap tier (haptic + quiet tap sound when the Sounds level allows it)
  | 'chip'
  | 'tab'
  | 'commit'
  | 'toggleOn'
  | 'toggleOff'
  | 'like'
  | 'unlike'
  | 'destructive';

export const HAPTIC_MOMENT_KIND: Record<HapticMoment, FeedbackKind> = {
  selection: 'selection',
  tapLight: 'impactLight',
  impactMedium: 'impactMedium',
  success: 'success',
  checkin: 'checkin',
  shared: 'shared',
  send: 'send',
  warning: 'warn',
  error: 'error',
  celebrate: 'celebrate',
  chip: 'chip',
  tab: 'tab',
  commit: 'commit',
  toggleOn: 'toggleOn',
  toggleOff: 'toggleOff',
  like: 'like',
  unlike: 'unlike',
  destructive: 'destructive',
};
