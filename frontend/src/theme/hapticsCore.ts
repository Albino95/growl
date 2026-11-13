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

/** Milestone signature: success, then rigid at +140ms, then soft at +280ms. */
export const CELEBRATE_SIGNATURE: { at: number; channel: Exclude<HapticChannel, 'celebrate' | 'none'> }[] = [
  { at: 0, channel: 'success' },
  { at: 140, channel: 'rigid' },
  { at: 280, channel: 'soft' },
];

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
 * The five Grow! UI sounds (assets/sounds/*.wav, one F-major-pentatonic
 * kalimba family). Sounds are reserved for signature moments only.
 */
export type SoundKey = 'bloom' | 'rise' | 'seedpop' | 'send' | 'softError';

export const SOUND_KEYS: readonly SoundKey[] = ['bloom', 'rise', 'seedpop', 'send', 'softError'];

export type FeedbackKind =
  // Channel kinds (preferred; see src/theme/haptics.ts for the moment API)
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  // Signature moments (haptic + sound)
  | 'checkin'
  | 'shared'
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
  haptic: HapticChannel;
  /** Vibration pattern (ms) used only when expo-haptics is unavailable. */
  vibrate?: number | number[];
  sound?: SoundKey;
};

/** Web approximations of the WAVs (same notes, same timing). */
export const WEB_SOUND_NOTES: Record<SoundKey, WebNote[]> = {
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
};

/**
 * Frequency rules: the more often something happens, the quieter it is.
 * selection → tabs/chips/segments/switches/sheet dismiss; impactLight →
 * state-changing taps; impactMedium → record/long-press/drag thresholds;
 * notification types → outcomes. Generic `tap` is deliberately silent.
 *
 * Sounds play only for: check-in (bloom), celebrate (rise), shared (seedpop),
 * send (send tick) and error (soft-error). Plain `success` is haptic-only.
 */
export const FEEDBACK_KINDS: Record<FeedbackKind, FeedbackConfig> = {
  selection: { haptic: 'selection', vibrate: 8 },
  impactLight: { haptic: 'impactLight', vibrate: 10 },
  impactMedium: { haptic: 'impactMedium', vibrate: 16 },

  checkin: { haptic: 'success', vibrate: [0, 10, 30, 16], sound: 'bloom' },
  shared: { haptic: 'success', vibrate: [0, 10, 30, 16], sound: 'seedpop' },

  tap: { haptic: 'none' },
  select: { haptic: 'selection', vibrate: 8 },
  tab: { haptic: 'selection', vibrate: 8 },
  toggle: { haptic: 'selection', vibrate: 8 },
  filter: { haptic: 'selection', vibrate: 8 },
  transition: { haptic: 'selection', vibrate: 8 },
  unlike: { haptic: 'selection', vibrate: 8 },
  close: { haptic: 'selection', vibrate: 8 },
  like: { haptic: 'impactLight', vibrate: 10 },
  open: { haptic: 'impactLight', vibrate: 10 },
  refresh: { haptic: 'impactLight', vibrate: 10 },
  commit: { haptic: 'impactLight', vibrate: 10 },
  autoLook: { haptic: 'impactLight', vibrate: 10 },
  egg: { haptic: 'rigid', vibrate: [0, 8, 36, 12] },
  send: { haptic: 'impactLight', vibrate: 10, sound: 'send' },
  success: { haptic: 'success', vibrate: [0, 10, 30, 16] },
  warn: { haptic: 'warning', vibrate: [0, 20, 40, 20] },
  delete: { haptic: 'warning', vibrate: [0, 18, 35, 22] },
  error: { haptic: 'error', vibrate: [0, 28, 50, 28], sound: 'softError' },
  celebrate: { haptic: 'celebrate', vibrate: [0, 12, 128, 16, 124, 10], sound: 'rise' },
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
  | 'celebrate';

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
};
