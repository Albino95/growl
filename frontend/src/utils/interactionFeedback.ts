import { Platform, Vibration } from 'react-native';
import type { Audio } from 'expo-av';
import { useUiPrefsStore } from '../state/useUiPrefsStore';

export type FeedbackKind =
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
  | 'commit';

type HapticStyle =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'soft'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection'
  | 'none';

type KindConfig = {
  haptic: HapticStyle;
  /** Extra Vibration pattern (ms) when expo-haptics unavailable or for layered feel. */
  vibrate?: number | number[];
  sound?:
    | 'tap'
    | 'select'
    | 'tab'
    | 'like'
    | 'unlike'
    | 'success'
    | 'send'
    | 'open'
    | 'close'
    | 'toggle'
    | 'warn'
    | 'error';
  /** Web Audio synthesis profile. */
  web?: { f0: number; f1?: number; ms: number; type?: OscillatorType; vol?: number };
};

const KIND: Record<FeedbackKind, KindConfig> = {
  tap: {
    haptic: 'light',
    vibrate: 8,
    sound: 'tap',
    web: { f0: 720, ms: 45, type: 'triangle', vol: 0.03 },
  },
  select: {
    haptic: 'selection',
    vibrate: 12,
    sound: 'select',
    web: { f0: 540, f1: 500, ms: 55, type: 'sine', vol: 0.032 },
  },
  tab: {
    haptic: 'soft',
    vibrate: [0, 10, 20, 8],
    sound: 'tab',
    web: { f0: 480, ms: 40, type: 'triangle', vol: 0.028 },
  },
  like: {
    haptic: 'medium',
    vibrate: [0, 12, 40, 18],
    sound: 'like',
    web: { f0: 620, f1: 880, ms: 95, type: 'sine', vol: 0.034 },
  },
  unlike: {
    haptic: 'soft',
    vibrate: 10,
    sound: 'unlike',
    web: { f0: 420, f1: 340, ms: 55, type: 'sine', vol: 0.024 },
  },
  open: {
    haptic: 'medium',
    vibrate: 14,
    sound: 'open',
    web: { f0: 500, f1: 640, ms: 65, type: 'triangle', vol: 0.03 },
  },
  close: {
    haptic: 'light',
    vibrate: 8,
    sound: 'close',
    web: { f0: 560, f1: 420, ms: 50, type: 'triangle', vol: 0.024 },
  },
  success: {
    haptic: 'success',
    vibrate: [0, 10, 30, 16],
    sound: 'success',
    web: { f0: 660, f1: 880, ms: 110, type: 'sine', vol: 0.034 },
  },
  send: {
    haptic: 'medium',
    vibrate: [0, 8, 18, 14],
    sound: 'send',
    web: { f0: 700, f1: 900, ms: 70, type: 'sine', vol: 0.03 },
  },
  toggle: {
    haptic: 'selection',
    vibrate: 11,
    sound: 'toggle',
    web: { f0: 610, ms: 48, type: 'sine', vol: 0.028 },
  },
  warn: {
    haptic: 'warning',
    vibrate: [0, 20, 40, 20],
    sound: 'warn',
    web: { f0: 340, ms: 90, type: 'square', vol: 0.03 },
  },
  error: {
    haptic: 'error',
    vibrate: [0, 28, 50, 28],
    sound: 'error',
    web: { f0: 280, f1: 220, ms: 140, type: 'square', vol: 0.032 },
  },
  delete: {
    haptic: 'warning',
    vibrate: [0, 18, 35, 22],
    sound: 'warn',
    web: { f0: 300, f1: 240, ms: 100, type: 'square', vol: 0.03 },
  },
  refresh: {
    haptic: 'soft',
    vibrate: 10,
    sound: 'select',
    web: { f0: 520, ms: 40, type: 'sine', vol: 0.022 },
  },
  transition: {
    haptic: 'soft',
    vibrate: [0, 6, 16, 8],
    sound: 'open',
    web: { f0: 480, f1: 560, ms: 55, type: 'triangle', vol: 0.022 },
  },
  egg: {
    haptic: 'rigid',
    vibrate: [0, 8, 36, 12, 40, 18],
    sound: 'success',
    web: { f0: 520, f1: 880, ms: 140, type: 'sine', vol: 0.03 },
  },
  celebrate: {
    haptic: 'success',
    vibrate: [0, 12, 28, 16, 36, 22],
    sound: 'success',
    web: { f0: 660, f1: 990, ms: 170, type: 'sine', vol: 0.036 },
  },
  /** Look chip — camera dial click, short. */
  filter: {
    haptic: 'selection',
    vibrate: 9,
    sound: 'select',
    web: { f0: 920, f1: 740, ms: 36, type: 'triangle', vol: 0.026 },
  },
  /** Auto look — two-note lift, like a grade landing. */
  autoLook: {
    haptic: 'success',
    vibrate: [0, 10, 24, 14],
    sound: 'success',
    web: { f0: 494, f1: 784, ms: 150, type: 'sine', vol: 0.03 },
  },
  /** Done / apply crop — soft shutter. */
  commit: {
    haptic: 'medium',
    vibrate: [0, 12, 20, 10],
    sound: 'send',
    web: { f0: 380, f1: 220, ms: 70, type: 'triangle', vol: 0.026 },
  },
};

const SOUND_MODULES: Record<NonNullable<KindConfig['sound']>, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  tap: require('../../assets/sounds/tap.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  select: require('../../assets/sounds/select.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  tab: require('../../assets/sounds/tab.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  like: require('../../assets/sounds/like.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  unlike: require('../../assets/sounds/unlike.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  success: require('../../assets/sounds/success.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  send: require('../../assets/sounds/send.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  open: require('../../assets/sounds/open.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  close: require('../../assets/sounds/close.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  toggle: require('../../assets/sounds/toggle.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  warn: require('../../assets/sounds/warn.wav'),
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

async function getNativeSound(key: NonNullable<KindConfig['sound']>): Promise<Audio.Sound | null> {
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

async function playNativeSound(key: NonNullable<KindConfig['sound']>) {
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

async function fireHaptic(style: HapticStyle, vibrate?: number | number[]) {
  if (Platform.OS === 'web') return;

  if (Haptics) {
    try {
      switch (style) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          return;
        case 'heavy':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          return;
        case 'soft': {
          const style =
            (Haptics.ImpactFeedbackStyle as Record<string, unknown>).Soft ??
            Haptics.ImpactFeedbackStyle.Light;
          await Haptics.impactAsync(style as typeof Haptics.ImpactFeedbackStyle.Light);
          return;
        }
        case 'rigid': {
          const style =
            (Haptics.ImpactFeedbackStyle as Record<string, unknown>).Rigid ??
            Haptics.ImpactFeedbackStyle.Medium;
          await Haptics.impactAsync(style as typeof Haptics.ImpactFeedbackStyle.Medium);
          return;
        }
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        case 'warning':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        case 'selection':
          await Haptics.selectionAsync();
          return;
        default:
          return;
      }
    } catch {
      /* fall through to Vibration */
    }
  }

  if (vibrate != null) {
    Vibration.vibrate(vibrate);
  }
}

/**
 * Unified tactile + audio feedback. Respects Settings toggles.
 * Use specific kinds so likes, tabs, menus, and CTAs feel distinct.
 */
export function triggerFeedback(kind: FeedbackKind = 'tap') {
  const { hapticsEnabled, soundEnabled } = useUiPrefsStore.getState();
  const cfg = KIND[kind] || KIND.tap;

  if (hapticsEnabled) {
    void fireHaptic(cfg.haptic, cfg.vibrate);
  }

  if (!soundEnabled || !cfg.sound) return;

  if (Platform.OS === 'web') {
    if (cfg.web) playWebTone(cfg.web);
    return;
  }
  void playNativeSound(cfg.sound);
}

/** @deprecated Prefer triggerFeedback('tap' | …) */
export function triggerPressFeedback() {
  triggerFeedback('tap');
}

/** Convenience helpers for common call sites. */
export const feedback = {
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
};
