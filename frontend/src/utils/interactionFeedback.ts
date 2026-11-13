import { Platform, Vibration } from 'react-native';
import type { Audio } from 'expo-av';
import { useUiPrefsStore } from '../state/useUiPrefsStore';
import {
  createHapticGate,
  playHapticChannel,
  type HapticChannel,
  type HapticsModule,
} from '../theme/hapticsCore';

export type FeedbackKind =
  // Channel kinds (preferred; see src/theme/haptics.ts for the moment API)
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  // Legacy kinds — still accepted, remapped to the calmer system below
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

type SoundKey = 'success' | 'send' | 'error';

type KindConfig = {
  haptic: HapticChannel;
  /** Vibration pattern (ms) used only when expo-haptics is unavailable. */
  vibrate?: number | number[];
  /** UI sounds are reserved for send, success, celebrate and error. */
  sound?: SoundKey;
  /** Web Audio synthesis profile. */
  web?: { f0: number; f1?: number; ms: number; type?: OscillatorType; vol?: number };
};

const SUCCESS_WEB = { f0: 660, f1: 880, ms: 110, type: 'sine' as const, vol: 0.034 };

/**
 * Frequency rules: the more often something happens, the quieter it is.
 * selection → tabs/chips/segments/switches; impactLight → state-changing taps;
 * impactMedium → record/long-press/drag thresholds; notification types → outcomes.
 * Generic `tap` is deliberately silent.
 */
const KIND: Record<FeedbackKind, KindConfig> = {
  selection: { haptic: 'selection', vibrate: 8 },
  impactLight: { haptic: 'impactLight', vibrate: 10 },
  impactMedium: { haptic: 'impactMedium', vibrate: 16 },

  tap: { haptic: 'none' },
  select: { haptic: 'selection', vibrate: 8 },
  tab: { haptic: 'selection', vibrate: 8 },
  toggle: { haptic: 'selection', vibrate: 8 },
  filter: { haptic: 'selection', vibrate: 8 },
  transition: { haptic: 'selection', vibrate: 8 },
  unlike: { haptic: 'selection', vibrate: 8 },
  close: { haptic: 'none' },
  like: { haptic: 'impactLight', vibrate: 10 },
  open: { haptic: 'impactLight', vibrate: 10 },
  refresh: { haptic: 'impactLight', vibrate: 10 },
  commit: { haptic: 'impactLight', vibrate: 10 },
  autoLook: { haptic: 'impactLight', vibrate: 10 },
  egg: { haptic: 'rigid', vibrate: [0, 8, 36, 12] },
  send: {
    haptic: 'impactLight',
    vibrate: 10,
    sound: 'send',
    web: { f0: 700, f1: 900, ms: 70, type: 'sine', vol: 0.03 },
  },
  success: { haptic: 'success', vibrate: [0, 10, 30, 16], sound: 'success', web: SUCCESS_WEB },
  warn: { haptic: 'warning', vibrate: [0, 20, 40, 20] },
  delete: { haptic: 'warning', vibrate: [0, 18, 35, 22] },
  error: {
    haptic: 'error',
    vibrate: [0, 28, 50, 28],
    sound: 'error',
    web: { f0: 280, f1: 220, ms: 140, type: 'square', vol: 0.032 },
  },
  celebrate: {
    haptic: 'celebrate',
    vibrate: [0, 12, 128, 16, 124, 10],
    sound: 'success',
    web: { f0: 660, f1: 990, ms: 170, type: 'sine', vol: 0.036 },
  },
  /** App-open splash — the seed smiles. One soft tap, deliberately silent. */
  bloom: { haptic: 'soft', vibrate: 6 },
};

/** Resolved channel + sound for a kind (exported for tests / debugging). */
export function describeFeedback(kind: FeedbackKind): { haptic: HapticChannel; sound: SoundKey | null } {
  const cfg = KIND[kind] || KIND.tap;
  return { haptic: cfg.haptic, sound: cfg.sound ?? null };
}

const SOUND_MODULES: Record<SoundKey, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  success: require('../../assets/sounds/success.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  send: require('../../assets/sounds/send.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  error: require('../../assets/sounds/error.wav'),
};

let webAudioCtx: AudioContext | null = null;
let audioModeReady = false;

/** expo-av is loaded on the first native UI sound, not at app start. */
let avModule: typeof import('expo-av') | null = null;
function getAv(): typeof import('expo-av') {
  if (!avModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    avModule = require('expo-av') as typeof import('expo-av');
  }
  return avModule;
}
function getAudio(): typeof Audio {
  return getAv().Audio;
}
const nativeSounds = new Map<string, Audio.Sound>();
const nativeLoading = new Map<string, Promise<Audio.Sound | null>>();
/** Camera / ImagePicker leaves expo-av in a bad state on iOS — skip sounds briefly. */
let hushNativeUntil = 0;

/** Mute UI sounds for a moment (e.g. right after camera). Haptics still fire. */
export function hushNativeAudio(ms = 2500) {
  hushNativeUntil = Date.now() + ms;
}

/** Unload cached UI Sound objects so they cannot sit next to a reel AVPlayer. */
export function releaseNativeAudio(hushMs = 4000): void {
  hushNativeAudio(hushMs);
  for (const sound of nativeSounds.values()) {
    void sound.stopAsync().catch(() => undefined);
    void sound.unloadAsync().catch(() => undefined);
  }
  nativeSounds.clear();
  nativeLoading.clear();
}

/** Reels / stories: never create expo-av UI sounds while a clip may load. */
export function lockNativeUiAudio(): void {
  for (const sound of nativeSounds.values()) {
    void sound.stopAsync().catch(() => undefined);
    void sound.unloadAsync().catch(() => undefined);
  }
  nativeSounds.clear();
  nativeLoading.clear();
  hushNativeUntil = Number.MAX_SAFE_INTEGER;
}

export function unlockNativeUiAudio(): void {
  hushNativeUntil = 0;
  // Reels set playsInSilentModeIOS: true while playing; re-apply the
  // silent-switch-respecting mode before the next UI sound.
  audioModeReady = false;
}

let Haptics: typeof import('expo-haptics') | null = null;
try {
  // Optional native module — Vibration fallback if missing in Expo Go / web.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

function playWebTone(cfg: NonNullable<KindConfig['web']>) {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  webAudioCtx = webAudioCtx || new AudioCtx();
  const ctx = webAudioCtx;
  if (ctx.state === 'suspended') void ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = cfg.type || 'triangle';
  const t0 = ctx.currentTime;
  const dur = Math.max(0.03, cfg.ms / 1000);
  osc.frequency.setValueAtTime(cfg.f0, t0);
  if (typeof cfg.f1 === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, cfg.f1), t0 + dur);
  }
  const vol = cfg.vol ?? 0.03;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.01);
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    // UI sounds are ambient: they must stay quiet when the iPhone silent
    // switch is on. (User-started playback — reels, Garden ambience — sets
    // its own mode when it starts.)
    await getAudio().setAudioModeAsync({
      playsInSilentModeIOS: false,
      // Mix with the user's music instead of stopping it for a click.
      interruptionModeIOS: getAv().InterruptionModeIOS.MixWithOthers,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
    audioModeReady = true;
  } catch {
    /* ignore */
  }
}

async function getNativeSound(key: SoundKey): Promise<Audio.Sound | null> {
  const cached = nativeSounds.get(key);
  if (cached) return cached;
  const inflight = nativeLoading.get(key);
  if (inflight) return inflight;

  const load = (async () => {
    try {
      await ensureAudioMode();
      const { sound } = await getAudio().Sound.createAsync(SOUND_MODULES[key], {
        shouldPlay: false,
        volume: 0.38,
      });
      nativeSounds.set(key, sound);
      return sound;
    } catch {
      return null;
    } finally {
      nativeLoading.delete(key);
    }
  })();
  nativeLoading.set(key, load);
  return load;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(null);
      });
  });
}

async function playNativeSound(key: SoundKey) {
  if (Date.now() < hushNativeUntil) return;
  try {
    const sound = await withTimeout(getNativeSound(key), 400);
    if (!sound) return;
    await withTimeout(sound.setPositionAsync(0), 250);
    await withTimeout(sound.playAsync(), 250);
  } catch {
    /* ignore — never block the UI after camera / check-in */
  }
}

const gate = createHapticGate();

async function fireHaptic(channel: HapticChannel, vibrate?: number | number[]) {
  if (Platform.OS === 'web' || channel === 'none') return;
  if (Haptics) {
    const ok = await playHapticChannel(Haptics as unknown as HapticsModule, channel);
    if (ok) return;
  }
  if (vibrate != null) Vibration.vibrate(vibrate);
}

/** How long an early haptic waits for persisted prefs before it is dropped. */
const PREFS_HYDRATION_WAIT_MS = 120;

/**
 * Runs `cb(true)` once the persisted sound/haptics prefs are loaded, so a
 * haptic at app start (e.g. the boot 'bloom') never buzzes a user who turned
 * haptics off. Waits up to `timeoutMs`; if prefs still are not hydrated by
 * then, calls `cb(false)` and callers should skip.
 */
export function whenFeedbackReady(cb: (ready: boolean) => void, timeoutMs = PREFS_HYDRATION_WAIT_MS) {
  const p = (useUiPrefsStore as { persist?: typeof useUiPrefsStore.persist }).persist;
  if (!p || p.hasHydrated()) {
    cb(true);
    return;
  }
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    unsub();
    cb(ready);
  };
  const unsub = p.onFinishHydration(() => finish(true));
  const timer = setTimeout(() => finish(p.hasHydrated()), timeoutMs);
}

function fireNow(kind: FeedbackKind, opts: { sound?: boolean }) {
  const { hapticsEnabled, soundEnabled } = useUiPrefsStore.getState();
  const cfg = KIND[kind] || KIND.tap;

  if (hapticsEnabled && cfg.haptic !== 'none' && gate.allow(cfg.haptic)) {
    void fireHaptic(cfg.haptic, cfg.vibrate);
  }

  if (!soundEnabled || !cfg.sound || opts.sound === false) return;

  if (Platform.OS === 'web') {
    if (cfg.web) playWebTone(cfg.web);
    return;
  }
  void playNativeSound(cfg.sound);
}

/**
 * Unified tactile + audio feedback. Respects Settings toggles (and waits for
 * them to load at app start), debounces per haptic group, and only plays
 * sounds for send / success / celebrate / error. Never call from scroll.
 */
export function triggerFeedback(kind: FeedbackKind = 'tap', opts: { sound?: boolean } = {}) {
  const cfg = KIND[kind] || KIND.tap;
  if (cfg.haptic === 'none' && !cfg.sound) return;
  whenFeedbackReady((ready) => {
    if (ready) fireNow(kind, opts);
  });
}

/** @deprecated Prefer `haptic(moment)` from src/theme/haptics. */
export function triggerPressFeedback() {
  triggerFeedback('tap');
}

/** Convenience helpers for common call sites. */
export const feedback = {
  selection: () => triggerFeedback('selection'),
  impactLight: () => triggerFeedback('impactLight'),
  impactMedium: () => triggerFeedback('impactMedium'),
  tap: () => triggerFeedback('tap'),
  select: () => triggerFeedback('select'),
  tab: () => triggerFeedback('tab'),
  like: (on = true) => triggerFeedback(on ? 'like' : 'unlike'),
  open: () => triggerFeedback('open'),
  close: () => triggerFeedback('close'),
  success: () => triggerFeedback('success'),
  send: () => triggerFeedback('send'),
  toggle: () => triggerFeedback('toggle'),
  warn: () => triggerFeedback('warn'),
  error: () => triggerFeedback('error'),
  delete: () => triggerFeedback('delete'),
  refresh: () => triggerFeedback('refresh'),
  transition: () => triggerFeedback('transition'),
  egg: () => triggerFeedback('egg'),
  celebrate: () => triggerFeedback('celebrate'),
  filter: () => triggerFeedback('filter'),
  autoLook: () => triggerFeedback('autoLook'),
  commit: () => triggerFeedback('commit'),
  bloom: () => triggerFeedback('bloom'),
};
