import { InteractionManager, Platform, Vibration } from 'react-native';
import type { AudioPlayer } from 'expo-audio';
import { uiPrefsReadiness, useUiPrefsStore } from '../state/useUiPrefsStore';
import {
  createHapticGate,
  createTapSoundLimiter,
  createVariantPicker,
  feedbackConfig,
  isTapSound,
  playHapticChannel,
  runHapticSequence,
  runWhenReady,
  soundAllowed,
  tapGainJitter,
  webLowpassHz,
  HAPTIC_SEQUENCES,
  PREFS_HYDRATION_WAIT_MS,
  SOUND_KEYS,
  TAP_SOUND_KEYS,
  TAP_SOUND_VARIANTS,
  WEB_SOUND_CLICK,
  WEB_SOUND_NOTES,
  type FeedbackKind,
  type HapticChannel,
  type HapticSequenceName,
  type HapticsModule,
  type ReadinessSource,
  type SoundKey,
  type SoundLevel,
  type TapSoundKey,
  type UiSoundKey,
} from '../theme/hapticsCore';

export type { FeedbackKind, SoundKey, SoundLevel, TapSoundKey, UiSoundKey } from '../theme/hapticsCore';

/** Resolved channel + sound for a kind (exported for tests / debugging). */
export function describeFeedback(kind: FeedbackKind): { haptic: HapticChannel; sound: UiSoundKey | null } {
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

/* eslint-disable @typescript-eslint/no-require-imports */
/** Tap tier: three rendered variants per sound (tap-<name>-1..3.wav). */
const TAP_SOUND_MODULES: Record<TapSoundKey, readonly number[]> = {
  tapToggleOn: [
    require('../../assets/sounds/tap-toggle-on-1.wav'),
    require('../../assets/sounds/tap-toggle-on-2.wav'),
    require('../../assets/sounds/tap-toggle-on-3.wav'),
  ],
  tapToggleOff: [
    require('../../assets/sounds/tap-toggle-off-1.wav'),
    require('../../assets/sounds/tap-toggle-off-2.wav'),
    require('../../assets/sounds/tap-toggle-off-3.wav'),
  ],
  tapTab: [
    require('../../assets/sounds/tap-tab-1.wav'),
    require('../../assets/sounds/tap-tab-2.wav'),
    require('../../assets/sounds/tap-tab-3.wav'),
  ],
  tapChip: [
    require('../../assets/sounds/tap-chip-1.wav'),
    require('../../assets/sounds/tap-chip-2.wav'),
    require('../../assets/sounds/tap-chip-3.wav'),
  ],
  tapCommit: [
    require('../../assets/sounds/tap-commit-1.wav'),
    require('../../assets/sounds/tap-commit-2.wav'),
    require('../../assets/sounds/tap-commit-3.wav'),
  ],
  tapLike: [
    require('../../assets/sounds/tap-like-1.wav'),
    require('../../assets/sounds/tap-like-2.wav'),
    require('../../assets/sounds/tap-like-3.wav'),
  ],
  tapRefresh: [
    require('../../assets/sounds/tap-refresh-1.wav'),
    require('../../assets/sounds/tap-refresh-2.wav'),
    require('../../assets/sounds/tap-refresh-3.wav'),
  ],
};
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Files are mastered at -6 dBFS peak (send -12, soft-error -14; taps -16 to
 * -26); this is the master UI level, applied to both tiers.
 */
const UI_SOUND_VOLUME = 0.45;

/** A native player id: a signature key, or `<tapKey>#<variant>`. */
type PlayerId = string;

function playerModule(id: PlayerId): number {
  const hash = id.indexOf('#');
  if (hash < 0) return SOUND_MODULES[id as SoundKey];
  const key = id.slice(0, hash) as TapSoundKey;
  return TAP_SOUND_MODULES[key][Number(id.slice(hash + 1))];
}

function tapPlayerId(key: TapSoundKey, variant: number): PlayerId {
  return `${key}#${variant}`;
}

function currentSoundLevel(): SoundLevel {
  return useUiPrefsStore.getState().soundLevel;
}

const tapLimiter = createTapSoundLimiter();
const variantPicker = createVariantPicker(TAP_SOUND_VARIANTS);

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
const nativeSounds = new Map<PlayerId, AudioPlayer>();
const nativeLoading = new Map<PlayerId, Promise<AudioPlayer | null>>();
/** Camera / ImagePicker hand the audio session back in a bad state on iOS — skip sounds briefly. */
let hushNativeUntil = 0;
/** Set while a lazy preload is queued / running (reset when UI audio is released). */
let preloadScheduled = false;
/** Sound level the warm-up last covered (Full warms more players than Subtle). */
let preloadedLevel: SoundLevel | null = null;

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
  preloadedLevel = null;
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
function playWebSound(key: UiSoundKey) {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    webAudioCtx = webAudioCtx || new AudioCtx();
    const ctx = webAudioCtx;
    if (ctx.state === 'suspended') void ctx.resume();
    const tap = isTapSound(key);
    // Taps: ±12 cents and ±1.5 dB per play, like the rendered native variants.
    const detune = tap ? Math.pow(2, ((Math.random() * 2 - 1) * 12) / 1200) : 1;
    const gainScale = tap ? tapGainJitter() : 1;
    const out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = webLowpassHz(key);
    out.connect(ctx.destination);
    const base = ctx.currentTime;
    const click = WEB_SOUND_CLICK[key];
    if (click) {
      // Short band-passed noise click before the pluck.
      const len = Math.max(8, Math.floor(ctx.sampleRate * (click.ms / 1000)));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 4));
      const src = ctx.createBufferSource();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = click.hz;
      const g = ctx.createGain();
      g.gain.value = click.vol * gainScale;
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
      osc.frequency.setValueAtTime(note.f * detune, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime((note.vol ?? 0.03) * gainScale, t0 + (tap ? 0.0015 : 0.003));
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

async function getNativeSound(key: PlayerId): Promise<AudioPlayer | null> {
  const cached = nativeSounds.get(key);
  if (cached) return cached;
  const inflight = nativeLoading.get(key);
  if (inflight) return inflight;

  const load = (async () => {
    try {
      await ensureAudioMode();
      // Reels/stories may have locked UI audio while the mode was applied.
      if (Date.now() < hushNativeUntil) return null;
      const player = getAudio().createAudioPlayer(playerModule(key));
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

function playNativeSound(id: PlayerId, volume = UI_SOUND_VOLUME): void {
  if (Date.now() < hushNativeUntil) return;
  const cached = nativeSounds.get(id);
  if (cached) {
    try {
      if (cached.volume !== volume) cached.volume = volume;
    } catch {
      /* released player */
    }
    startPlayer(cached);
    return;
  }
  void (async () => {
    try {
      const player = await withTimeout(getNativeSound(id), 400);
      if (!player || Date.now() < hushNativeUntil) return;
      player.volume = volume;
      // play() before the file is buffered is fine: playback starts when ready.
      startPlayer(player);
    } catch {
      /* ignore — never block the UI after camera / check-in */
    }
  })();
}

/**
 * Route a UI sound to its player. Tap sounds pick a random variant (never the
 * same one twice in a row) with ±1.5 dB gain jitter; signature sounds play
 * their single file at the master level.
 */
function playUiSound(key: UiSoundKey): void {
  if (Platform.OS === 'web') {
    playWebSound(key);
    return;
  }
  if (isTapSound(key)) {
    const variant = variantPicker.next(key);
    playNativeSound(tapPlayerId(key, variant), UI_SOUND_VOLUME * tapGainJitter());
    return;
  }
  playNativeSound(key);
}

/** Player ids worth warming for a level: signature five, then that level's taps. */
function preloadIds(level: SoundLevel): PlayerId[] {
  const ids: PlayerId[] = [...SOUND_KEYS];
  for (const key of TAP_SOUND_KEYS) {
    if (!soundAllowed(level, key)) continue;
    for (let v = 0; v < TAP_SOUND_VARIANTS; v++) ids.push(tapPlayerId(key, v));
  }
  return ids;
}

/**
 * Warm the UI sounds after the first interaction settles (never at cold
 * start): signature sounds first, then the tap variants the current Sounds
 * level can play. Skipped on web, when sounds are off, or while hushed.
 * Runs again if the level is raised (Subtle → Full) later.
 */
function schedulePreload(): void {
  if (preloadScheduled || Platform.OS === 'web') return;
  const level = currentSoundLevel();
  if (level === 'off' || preloadedLevel === 'full' || preloadedLevel === level) return;
  preloadScheduled = true;
  const run = () => {
    const lvl = currentSoundLevel();
    if (lvl === 'off' || Date.now() < hushNativeUntil) {
      preloadScheduled = false; // try again on a later interaction
      return;
    }
    void (async () => {
      let complete = true;
      for (const id of preloadIds(lvl)) {
        if (Date.now() < hushNativeUntil) {
          complete = false;
          break;
        }
        if (nativeSounds.has(id)) continue;
        const player = await withTimeout(getNativeSound(id), 1500);
        // Pace the warm-up: let each file buffer before opening the next.
        if (player) await withTimeout(whenPlayerLoaded(player), 1500);
      }
      if (complete) preloadedLevel = lvl;
      preloadScheduled = false;
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

/** One running pattern per sequence name; a re-fire cancels the old one. */
const activeSequences = new Map<HapticSequenceName, () => void>();

function startHapticSequence(name: HapticSequenceName, vibrate?: number | number[]): void {
  if (Platform.OS === 'web') return;
  if (!Haptics) {
    if (vibrate != null) Vibration.vibrate(vibrate);
    return;
  }
  activeSequences.get(name)?.();
  const cancel = runHapticSequence(HAPTIC_SEQUENCES[name], (channel) => void fireHaptic(channel), {
    enabled: () => useUiPrefsStore.getState().hapticsEnabled,
  });
  activeSequences.set(name, cancel);
}

/** Stop any multi-step haptic still pending (e.g. on screen blur). */
export function cancelHapticSequences(): void {
  for (const cancel of activeSequences.values()) cancel();
  activeSequences.clear();
}

function fireNow(kind: FeedbackKind, opts: { sound?: boolean }) {
  const { hapticsEnabled, soundLevel } = useUiPrefsStore.getState();
  const cfg = feedbackConfig(kind);

  // Haptic first, then the sound in the same tick (neither is awaited).
  if (hapticsEnabled && cfg.haptic !== 'none' && gate.allow(cfg.haptic)) {
    if (cfg.sequence) startHapticSequence(cfg.sequence, cfg.vibrate);
    else void fireHaptic(cfg.haptic, cfg.vibrate);
  }

  const sound = cfg.sound;
  if (!sound || opts.sound === false || !soundAllowed(soundLevel, sound)) return;
  // Tap sounds: 90 ms per class / 50 ms across taps — dropped, never queued.
  if (isTapSound(sound) && !tapLimiter.allow(sound)) return;
  playUiSound(sound);
}

/**
 * Play a UI sound directly (e.g. the Settings preview). Respects hush, not the
 * sound pref or the tap rate limit.
 */
export function previewSound(key: UiSoundKey): void {
  playUiSound(key);
}

/**
 * Unified tactile + audio feedback. Respects Settings (haptics on/off, Sounds
 * Off / Subtle / Full — and waits for them to load at app start), debounces
 * per haptic group and rate-limits tap sounds. Never call from scroll.
 */
export function triggerFeedback(kind: FeedbackKind = 'tap', opts: { sound?: boolean } = {}) {
  const cfg = feedbackConfig(kind);
  if (cfg.haptic === 'none' && !cfg.sound) return;
  whenFeedbackReady(() => fireNow(kind, opts));
  schedulePreload();
}

/** Switch feedback: selection tick + toggle-on / toggle-off tap sound. */
export function toggleFeedback(value: boolean): void {
  triggerFeedback(value ? 'toggleOn' : 'toggleOff');
}

/**
 * Long-press peek: soft on press-in, medium when the peek / reaction tray
 * actually opens. Wire `pressIn` to onPressIn / long-press start and `open`
 * to the moment the preview appears.
 */
export const longPressPeek = {
  pressIn: () => triggerFeedback('longPressIn'),
  open: () => triggerFeedback('peekOpen'),
};

/** Kick off the sound warm-up once the first screen has settled. */
export function warmUiSoundsAfterMount(): void {
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
  chip: () => triggerFeedback('chip'),
  toggleOn: () => triggerFeedback('toggleOn'),
  toggleOff: () => triggerFeedback('toggleOff'),
  switch: (value: boolean) => toggleFeedback(value),
  like: (on = true) => triggerFeedback(on ? 'like' : 'unlike'),
  likeDoubleTap: () => triggerFeedback('likeDoubleTap'),
  refreshThreshold: () => triggerFeedback('refreshThreshold'),
  refreshDone: () => triggerFeedback('refreshDone'),
  longPressIn: () => triggerFeedback('longPressIn'),
  peekOpen: () => triggerFeedback('peekOpen'),
  destructive: () => triggerFeedback('destructive'),
  sheetSnap: () => triggerFeedback('sheetSnap'),
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
