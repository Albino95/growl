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
  notification: 800,
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
    case 'warning':
    case 'error':
      return 'notification';
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
