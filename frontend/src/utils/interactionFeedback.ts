import { InteractionManager, Platform, Vibration } from 'react-native';
import type { AudioPlayer } from 'expo-audio';
import { uiPrefsReadiness, useUiPrefsStore } from '../state/useUiPrefsStore';
import {
  createHapticGate,
  feedbackConfig,
  playHapticChannel,
  runWhenReady,
  PREFS_HYDRATION_WAIT_MS,
  SOUND_KEYS,
  WEB_SOUND_NOTES,
  type FeedbackKind,
  type HapticChannel,
  type HapticsModule,
  type ReadinessSource,
  type SoundKey,
} from '../theme/hapticsCore';

export type { FeedbackKind, SoundKey } from '../theme/hapticsCore';

/** Resolved channel + sound for a kind (exported for tests / debugging). */
export function describeFeedback(kind: FeedbackKind): { haptic: HapticChannel; sound: SoundKey | null } {
  const cfg = feedbackConfig(kind);
  return { haptic: cfg.haptic, sound: cfg.sound ?? null };
}

/*
 * Native playback: one expo-audio player per sound (createAudioPlayer), created
 * lazily after the first feedback, never at cold start. Audio mode is ambient:
 * respects the silent switch and mixes with the user's music.
 */
const SOUND_MODULES: Record<SoundKey, number> = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  bloom: require('../../assets/sounds/bloom.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  rise: require('../../assets/sounds/rise.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  seedpop: require('../../assets/sounds/seedpop.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  send: require('../../assets/sounds/send.wav'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  softError: require('../../assets/sounds/soft-error.wav'),
};

/** Files are mastered at -6 dBFS peak (send -12, soft-error -14); this is the master UI level. */
const UI_SOUND_VOLUME = 0.45;

let webAudioCtx: AudioContext | null = null;
let audioModeReady = false;

/** expo-audio is loaded on the first native UI sound, not at app start. */
let audioModule: typeof import('expo-audio') | null = null;
function getAudio(): typeof import('expo-audio') {
  if (!audioModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioModule = require('expo-audio') as typeof import('expo-audio');
  }
  return audioModule;
}
const nativeSounds = new Map<string, AudioPlayer>();
const nativeLoading = new Map<string, Promise<AudioPlayer | null>>();
/** Camera / ImagePicker hand the audio session back in a bad state on iOS — skip sounds briefly. */
let hushNativeUntil = 0;
/** Set once the lazy preload has been queued (reset when UI audio is released). */
let preloadScheduled = false;

function disposePlayer(player: AudioPlayer): void {
  try {
    player.pause();
  } catch {
    /* ignore */
  }
  try {
    player.remove();
  } catch {
    /* ignore */
  }
}

function disposeAllNativeSounds(): void {
  for (const player of nativeSounds.values()) disposePlayer(player);
  nativeSounds.clear();
  nativeLoading.clear();
  preloadScheduled = false;
}

/** Mute UI sounds for a moment (e.g. right after camera). Haptics still fire. */
export function hushNativeAudio(ms = 2500) {
  hushNativeUntil = Date.now() + ms;
}

/** Release cached UI players so they cannot sit next to a reel AVPlayer. */
export function releaseNativeAudio(hushMs = 4000): void {
  hushNativeAudio(hushMs);
  disposeAllNativeSounds();
}

/** Reels / stories: never create UI sound players while a clip may load. */
export function lockNativeUiAudio(): void {
  disposeAllNativeSounds();
  hushNativeUntil = Number.MAX_SAFE_INTEGER;
}

export function unlockNativeUiAudio(): void {
  hushNativeUntil = 0;
  // Reels / Garden may switch to playsInSilentMode: true while playing;
  // re-apply the silent-switch-respecting mode before the next UI sound.
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

/** Web fallback: soft sine plucks (plus a lowpass) approximating the WAV notes. */
function playWebSound(key: SoundKey) {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    webAudioCtx = webAudioCtx || new AudioCtx();
    const ctx = webAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = key === 'softError' ? 1500 : 6000;
    out.connect(ctx.destination);
    const base = ctx.currentTime;
    if (key === 'seedpop') {
      // 15 ms filtered-noise pop before the pluck.
      const len = Math.floor(ctx.sampleRate * 0.015);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 4));
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      src.buffer = buffer;
      src.connect(bp);
      bp.connect(g);
      g.connect(out);
      src.start(base);
    }
    for (const note of WEB_SOUND_NOTES[key]) {
      const t0 = base + note.at / 1000;
      const dur = Math.max(0.03, note.ms / 1000);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.f, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(note.vol ?? 0.03, t0 + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    }
  } catch {
    /* ignore */
  }
}

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    // UI sounds are ambient: they must stay quiet when the iPhone silent
    // switch is on. (User-started playback — reels, Garden ambience — sets
    // its own mode when it starts.)
    await getAudio().setAudioModeAsync({
      playsInSilentMode: false,
      // Mix with the user's music instead of stopping it for a click.
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
    });
    audioModeReady = true;
  } catch {
    /* ignore */
  }
}

/** Resolves once the player has buffered its file (or right away if it already has). */
function whenPlayerLoaded(player: AudioPlayer): Promise<AudioPlayer> {
  return new Promise((resolve, reject) => {
    try {
      if (player.isLoaded) {
        resolve(player);
        return;
      }
      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.isLoaded) return;
        sub.remove();
        resolve(player);
      });
    } catch (e) {
      reject(e); // player was released mid-warm-up
    }
  });
}

async function getNativeSound(key: SoundKey): Promise<AudioPlayer | null> {
  const cached = nativeSounds.get(key);
  if (cached) return cached;
  const inflight = nativeLoading.get(key);
  if (inflight) return inflight;

  const load = (async () => {
    try {
      await ensureAudioMode();
      // Reels/stories may have locked UI audio while the mode was applied.
      if (Date.now() < hushNativeUntil) return null;
      const player = getAudio().createAudioPlayer(SOUND_MODULES[key]);
      player.volume = UI_SOUND_VOLUME;
      // Rewind as soon as a play ends, so the next play() starts instantly
      // without waiting on a seek.
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) void player.seekTo(0).catch(() => undefined);
      });
      nativeSounds.set(key, player);
      return player;
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

/**
 * Starts the sound in the same tick as the haptic: players are rewound when a
 * play finishes, so a rested player just needs play(). Only a sound that is
 * still mid-play (rapid repeat) waits on a seek back to 0.
 */
function startPlayer(player: AudioPlayer): void {
  try {
    if (player.playing || player.currentTime > 0.02) {
      player
        .seekTo(0)
        .then(() => {
          if (Date.now() < hushNativeUntil) return;
          player.play();
        })
        .catch(() => undefined);
    } else {
      player.play();
    }
  } catch {
    /* released player — ignore */
  }
}

function playNativeSound(key: SoundKey): void {
  if (Date.now() < hushNativeUntil) return;
  const cached = nativeSounds.get(key);
  if (cached) {
    startPlayer(cached);
    return;
  }
  void (async () => {
    try {
      const player = await withTimeout(getNativeSound(key), 400);
      if (!player || Date.now() < hushNativeUntil) return;
      // play() before the file is buffered is fine: playback starts when ready.
      startPlayer(player);
    } catch {
      /* ignore — never block the UI after camera / check-in */
    }
  })();
}

/**
 * Warm the five UI sounds after the first interaction settles (never at cold
 * start). Skipped on web, when sounds are off, or while UI audio is hushed.
 */
function schedulePreload(): void {
  if (preloadScheduled || Platform.OS === 'web') return;
  preloadScheduled = true;
  const run = () => {
    if (!useUiPrefsStore.getState().soundEnabled) {
      preloadScheduled = false; // try again on a later interaction
      return;
    }
    if (Date.now() < hushNativeUntil) {
      preloadScheduled = false;
      return;
    }
    void (async () => {
      for (const key of SOUND_KEYS) {
        if (Date.now() < hushNativeUntil) break;
        const player = await withTimeout(getNativeSound(key), 1500);
        // Pace the warm-up: let each file buffer before opening the next.
        if (player) await withTimeout(whenPlayerLoaded(player), 1500);
      }
    })();
  };
  try {
    InteractionManager.runAfterInteractions(run);
  } catch {
    setTimeout(run, 0);
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

const prefsReadiness: ReadinessSource = {
  isReady: () => {
    if (uiPrefsReadiness.isReady()) return true;
    const p = (useUiPrefsStore as { persist?: typeof useUiPrefsStore.persist }).persist;
    return !p || p.hasHydrated();
  },
  onReady: (cb) => uiPrefsReadiness.onReady(cb),
};

/**
 * Runs `cb` once the persisted sound/haptics prefs are loaded, so a haptic at
 * app start (e.g. the boot 'bloom') respects a user who turned haptics off.
 * Waits up to `timeoutMs`; if rehydration is slow or failed, it still fires
 * with the defaults (never silently dropped). `cb` always receives `true`
 * (kept for backward compatibility with the old signature).
 */
export function whenFeedbackReady(cb: (ready: boolean) => void, timeoutMs = PREFS_HYDRATION_WAIT_MS) {
  runWhenReady(prefsReadiness, () => cb(true), timeoutMs);
}

function fireNow(kind: FeedbackKind, opts: { sound?: boolean }) {
  const { hapticsEnabled, soundEnabled } = useUiPrefsStore.getState();
  const cfg = feedbackConfig(kind);

  // Haptic first, then the sound in the same tick (neither is awaited).
  if (hapticsEnabled && cfg.haptic !== 'none' && gate.allow(cfg.haptic)) {
    void fireHaptic(cfg.haptic, cfg.vibrate);
  }

  if (!soundEnabled || !cfg.sound || opts.sound === false) return;

  if (Platform.OS === 'web') {
    playWebSound(cfg.sound);
    return;
  }
  playNativeSound(cfg.sound);
}

/** Play a UI sound directly (e.g. the Settings preview). Respects hush, not the sound pref. */
export function previewSound(key: SoundKey): void {
  if (Platform.OS === 'web') playWebSound(key);
  else playNativeSound(key);
}

/**
 * Unified tactile + audio feedback. Respects Settings toggles (and waits for
 * them to load at app start), debounces per haptic group, and plays sounds
 * only for check-in, celebrate, shared, send and error. Never call from scroll.
 */
export function triggerFeedback(kind: FeedbackKind = 'tap', opts: { sound?: boolean } = {}) {
  const cfg = feedbackConfig(kind);
  if (cfg.haptic === 'none' && !cfg.sound) return;
  whenFeedbackReady(() => fireNow(kind, opts));
  schedulePreload();
}

export function triggerPressFeedback() {
  triggerFeedback('selection');
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
  checkin: () => triggerFeedback('checkin'),
  shared: () => triggerFeedback('shared'),
};
