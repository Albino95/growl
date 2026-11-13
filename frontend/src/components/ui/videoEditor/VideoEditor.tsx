import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NativeClipPlayer from './NativeClipPlayer';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../../lib/tw';
import { formInputAccessoryProps } from '../KeyboardDoneAccessory';
import { feedback } from '../../../utils/interactionFeedback';
import type { TextOverlay, TextOverlayStyle, EditAdjustments } from '../photoEditor/types';
import {
  TEXT_QUICK_PHRASES,
  DEFAULT_ADJUSTMENTS,
  MAX_TEXT_OVERLAYS,
} from '../photoEditor/types';
import { alertMessage } from '../../../utils/confirmDialog';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import {
  EditorLoadingState,
  EditorShell,
  EditorToolTabs,
  useDelayedFlag,
  type EditorToolTab,
} from '../editorShell';
import { MUSIC_PLAYBACK_SUPPORTED } from '../../../utils/mediaCapabilities';
import DraggableTextOverlay from '../photoEditor/DraggableTextOverlay';
import { AdjustSlider } from '../photoEditor/AdjustSlider';
import type { VideoEditSettings, VideoLookId } from './types';
import {
  DEFAULT_VIDEO_EDIT,
  SPEED_PRESETS,
  normalizeVideoEdit,
} from './types';
import FilmstripTrimmer from './FilmstripTrimmer';
import VideoLookPanel from './VideoLookPanel';
import { buildVideoCssFilter } from './videoFilters';
import { VideoGradeStack } from './GradeOverlays';
import {
  buildPlaceholders,
  extractVideoFrames,
  frameCountForDuration,
  frameImageSource,
  nearestFrame,
  remapFrameTimes,
  stillFromFrames,
  type FrameThumb,
} from './extractFrames';
import { shouldMountNativePlayer } from './videoEditorPolicy';
import { clipEndMs, playFromMs } from './editorPlayback';
import {
  POST_MUSIC_TRACKS,
  MUSIC_GENRE_FILTERS,
  getMusicTrackById,
  getMusicPlaybackUrl,
  getPrimaryMusicTracks,
  type PostMusicTrack,
} from '../../../constants/postMusic';
import { fitReelStage } from '../../../utils/fitMediaBox';

type Tab = 'edit' | 'look' | 'audio';

const TABS: EditorToolTab<Tab>[] = [
  { id: 'edit', label: 'Edit', icon: 'cut-outline' },
  { id: 'look', label: 'Look', icon: 'color-filter-outline' },
  { id: 'audio', label: 'Sound', icon: 'musical-notes-outline' },
];

/** Only show the saving overlay when Done takes longer than this. */
const SAVING_OVERLAY_DELAY_MS = 150;

const TEXT_STYLES: { id: TextOverlayStyle; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'bold', label: 'Bold' },
  { id: 'pill', label: 'Pill' },
  { id: 'neon', label: 'Neon' },
  { id: 'banner', label: 'Banner' },
];

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function newOverlay(text = 'GROW'): TextOverlay {
  return {
    id: `vt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    x: 0.5,
    y: 0.42,
    color: '#FFFFFF',
    style: 'outline',
    scale: 1,
    align: 'center',
  };
}

type Props = {
  videoUri: string;
  initialSettings?: Partial<VideoEditSettings>;
  title?: string;
  /** Stories cap at 30s — clamp the trim window once duration is known. */
  maxClipMs?: number;
  /** Picker/camera duration so we can sample frames before the player mounts. */
  hintDurationMs?: number;
  /** Stills sampled before any native player opened the clip. */
  initialFrames?: FrameThumb[];
  /**
   * 'story' keeps only trim: the story API stores just the media URL (+ trim
   * params), so looks, text, sound, speed, flip and cover would be dropped.
   */
  mode?: 'reel' | 'story';
  /**
   * May return a promise (e.g. cover/frame capture in the caller): the editor
   * shows its saving overlay until it settles (only if it takes > 150ms).
   */
  onSave: (settings: VideoEditSettings) => void | Promise<void>;
  onCancel: () => void;
};

export default function VideoEditor({
  videoUri,
  initialSettings,
  title = 'Edit video',
  maxClipMs,
  hintDurationMs = 0,
  initialFrames,
  mode = 'reel',
  onSave,
  onCancel,
}: Props) {
  const isStory = mode === 'story';
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const maxPreviewW = winW - 24;
  const maxPreviewH = Math.min(winH * 0.46, maxPreviewW * (16 / 9));
  const reelStage = fitReelStage(maxPreviewW, maxPreviewH);
  const initial = normalizeVideoEdit(initialSettings);
  const htmlVideoRef = useRef<{
    play: () => Promise<void>;
    pause: () => void;
    currentTime: number;
    playbackRate: number;
    muted: boolean;
    volume: number;
    duration: number;
    paused: boolean;
  } | null>(null);
  /** Web-only soundtrack preview (native Edit never opens a soundtrack player). */
  const soundRef = useRef<HTMLAudioElement | null>(null);

  const [tab, setTab] = useState<Tab>('edit');
  const [durationMs, setDurationMs] = useState(Math.max(0, hintDurationMs));
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerArmed, setPlayerArmed] = useState(Platform.OS === 'web');
  const [userPressedPlay, setUserPressedPlay] = useState(false);
  const [stripFrames, setStripFrames] = useState<FrameThumb[]>(() =>
    initialFrames && initialFrames.length > 0
      ? initialFrames
      : buildPlaceholders(
          Math.max(hintDurationMs, 1000),
          frameCountForDuration(Math.max(hintDurationMs, 1000))
        )
  );
  const [stillUri, setStillUri] = useState<string | null>(
    () => stillFromFrames(initialFrames || [])
  );
  const videoReady = useRef(false);
  const playingRef = useRef(false);
  const [seekGeneration, setSeekGeneration] = useState(0);
  const [playHeadSeekMs, setPlayHeadSeekMs] = useState(0);
  // Web mounts the <video> right away, so it starts "preparing" until metadata
  // arrives (or the 5s grace below). Native only loads after the first Play.
  const [loading, setLoading] = useState(Platform.OS === 'web');
  /** Done pressed and its async work (sound teardown, caller's onSave) running. */
  const [doneBusy, setDoneBusy] = useState(false);
  const doneBusyRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const showSaving = useDelayedFlag(doneBusy, SAVING_OVERLAY_DELAY_MS);
  const [previewSize, setPreviewSize] = useState({ w: reelStage.width, h: reelStage.height });

  const [originalVolume, setOriginalVolume] = useState(initial.originalVolume);
  const [speed, setSpeed] = useState(initial.speed);
  const [trimStartMs, setTrimStartMs] = useState(initial.trimStartMs);
  const [trimEndMs, setTrimEndMs] = useState(initial.trimEndMs);
  const [coverMs, setCoverMs] = useState(initial.coverMs);
  const [flipH, setFlipH] = useState(initial.flipH);
  const [flipV, setFlipV] = useState(initial.flipV);
  const [lookId, setLookId] = useState<VideoLookId>(initial.lookId);
  const [filterPresetId, setFilterPresetId] = useState<string | null>(initial.filterPresetId);
  const [manualAdjust, setManualAdjust] = useState<EditAdjustments>({
    ...DEFAULT_ADJUSTMENTS,
    ...initial.manualAdjust,
  });
  const [audioTrackId, setAudioTrackId] = useState<string | null>(
    initial.audioTrackId ||
      (initial.audioUrl
        ? POST_MUSIC_TRACKS.find((t) => t.url === initial.audioUrl)?.id || null
        : null)
  );
  const [audioVolume, setAudioVolume] = useState(initial.audioVolume);
  const [overlays, setOverlays] = useState<TextOverlay[]>(
    initial.overlays.map((o) => ({ ...o }))
  );
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    initial.overlays[0]?.id ?? null
  );
  const [musicGenre, setMusicGenre] = useState<(typeof MUSIC_GENRE_FILTERS)[number]>('All');
  const initialSnap = useRef(initial).current;
  const initialTrackId = useRef(audioTrackId).current;

  useEffect(() => {
    if (!initialFrames?.some((f) => f.uri && !f.placeholder)) return;
    setStripFrames(initialFrames);
    const still = stillFromFrames(initialFrames);
    if (still) setStillUri(still);
  }, [initialFrames]);

  useEffect(() => {
    if (!playerArmed || !loading) return;
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, [playerArmed, loading]);

  const selectedTrack = getMusicTrackById(audioTrackId);
  const soundtrackUrl = getMusicPlaybackUrl(selectedTrack?.id, selectedTrack?.url);
  const hasSoundtrack = Boolean(soundtrackUrl);
  const libraryTracks = getPrimaryMusicTracks().filter(
    (t) => musicGenre === 'All' || t.genre === musicGenre
  );
  const editPreview: VideoEditSettings = normalizeVideoEdit({
    lookId,
    filterPresetId,
    manualAdjust,
  });
  const webFilter = Platform.OS === 'web' ? buildVideoCssFilter(editPreview) : undefined;
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;
  const effectiveEnd = clipEndMs(trimEndMs, durationMs);
  playingRef.current = playing;
  const isOriginalMuted = originalVolume <= 0.001;
  const scrubFrame = nearestFrame(stripFrames, positionMs);
  const scrubSource =
    frameImageSource(scrubFrame) || (stillUri ? { uri: stillUri } : null);
  const scrubStill = (typeof scrubSource === 'object' && scrubSource && 'uri' in scrubSource
    ? (scrubSource as { uri?: string }).uri
    : null) || stillUri;

  const buildSettings = useCallback((): VideoEditSettings => {
    const end = durationMs > 0 ? Math.min(effectiveEnd || durationMs, durationMs) : trimEndMs;
    const start = Math.max(0, Math.min(trimStartMs, Math.max(0, end - 500)));
    return normalizeVideoEdit({
      muted: isOriginalMuted,
      originalVolume,
      speed,
      trimStartMs: start,
      trimEndMs: end,
      coverMs: Math.max(start, Math.min(coverMs || start, end || coverMs)),
      flipH,
      flipV,
      lookId,
      filterPresetId,
      manualAdjust,
      overlays,
      audioTrackId: selectedTrack?.id ?? null,
      // Persist proxied URL so feed/web playback works without CORS issues
      audioUrl: getMusicPlaybackUrl(selectedTrack?.id, selectedTrack?.url),
      audioTitle: selectedTrack ? `${selectedTrack.title} · ${selectedTrack.artist}` : null,
      audioVolume,
    });
  }, [
    audioVolume,
    coverMs,
    durationMs,
    effectiveEnd,
    flipH,
    flipV,
    isOriginalMuted,
    lookId,
    filterPresetId,
    manualAdjust,
    originalVolume,
    overlays,
    selectedTrack,
    speed,
    trimEndMs,
    trimStartMs,
  ]);

  const applyNativeDuration = useCallback(
    (dur: number) => {
      if (!(dur > 0)) return;
      const cap = maxClipMs && maxClipMs > 0 ? Math.min(dur, maxClipMs) : dur;
      setDurationMs((prev) => (Math.abs(prev - dur) > 50 ? dur : prev));
      setStripFrames((frames) => remapFrameTimes(frames, dur));
      setTrimEndMs((prev) => {
        if (prev > cap) return cap;
        if (maxClipMs && maxClipMs > 0 && dur > maxClipMs && (prev <= 0 || prev > maxClipMs)) {
          return maxClipMs;
        }
        return prev;
      });
    },
    [maxClipMs]
  );

  const onNativeProgress = useCallback(
    (position: number, duration: number) => {
      videoReady.current = true;
      setLoading(false);
      setPlayerReady(true);
      applyNativeDuration(duration);
      if (!playingRef.current) return;
      const end = clipEndMs(trimEndMs, duration || durationMs);
      if (end > 0 && position >= end - 40) {
        const start = Math.max(0, trimStartMs);
        setPositionMs(start);
        setPlayHeadSeekMs(start);
        setSeekGeneration((g) => g + 1);
        return;
      }
      setPositionMs(position);
    },
    [applyNativeDuration, durationMs, trimEndMs, trimStartMs]
  );

  const onNativeReady = useCallback(() => {
    videoReady.current = true;
    setLoading(false);
    setPlayerReady(true);
  }, []);

  const onNativeEnded = useCallback(() => {
    const start = Math.max(0, trimStartMs);
    setPositionMs(start);
    setPlayHeadSeekMs(start);
    setSeekGeneration((g) => g + 1);
    if (playingRef.current) {
      setPlaying(true);
      return;
    }
    setPlaying(false);
  }, [trimStartMs]);

  const applyWebDuration = useCallback((durationSec: number) => {
    if (!durationSec || !Number.isFinite(durationSec)) return;
    const dur = durationSec * 1000;
    const cap = maxClipMs && maxClipMs > 0 ? Math.min(dur, maxClipMs) : dur;
    setDurationMs((prev) => (Math.abs(prev - dur) > 50 ? dur : prev));
    setTrimEndMs((prev) => {
      if (prev > cap) return cap;
      if (maxClipMs && maxClipMs > 0 && dur > maxClipMs && (prev <= 0 || prev > maxClipMs)) {
        return maxClipMs;
      }
      return prev;
    });
  }, [maxClipMs]);

  const onWebTimeUpdate = useCallback(() => {
    const el = htmlVideoRef.current;
    if (!el) return;
    setLoading(false);
    setPlaying(!el.paused);
    setPositionMs(el.currentTime * 1000);
    applyWebDuration(el.duration);
    const end = trimEndMs > 0 ? trimEndMs / 1000 : 0;
    if (end > 0 && el.currentTime >= end - 0.08) {
      el.currentTime = trimStartMs / 1000;
      if (soundRef.current) soundRef.current.currentTime = 0;
    }
  }, [applyWebDuration, trimEndMs, trimStartMs]);

  useEffect(() => {
    setPreviewSize({ w: reelStage.width, h: reelStage.height });
  }, [reelStage.width, reelStage.height]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const el = htmlVideoRef.current;
      if (el) {
        el.muted = isOriginalMuted;
        el.volume = isOriginalMuted ? 0 : Math.max(0, Math.min(1, originalVolume));
      }
      return;
    }
  }, [isOriginalMuted, originalVolume, playerReady]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (htmlVideoRef.current) htmlVideoRef.current.playbackRate = speed;
      return;
    }
  }, [speed, playerReady]);

  useEffect(() => {
    const release = () => {
      const el = soundRef.current;
      soundRef.current = null;
      if (!el) return;
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
    release();
    if (!selectedTrack?.id && !selectedTrack?.url) return;
    // Native: no soundtrack player inside Edit (see nativeEditorLoadsAudioOnOpen).
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const playbackUrl = getMusicPlaybackUrl(selectedTrack.id, selectedTrack.url);
    if (!playbackUrl) return;
    const el = new window.Audio();
    el.loop = true;
    el.volume = Math.max(0, Math.min(1, audioVolume));
    const fallbackUrl = selectedTrack.url;
    if (fallbackUrl && fallbackUrl !== playbackUrl) {
      // Proxy may be undeployed — fall back to the upstream URL once.
      el.addEventListener(
        'error',
        () => {
          if (soundRef.current !== el) return;
          el.src = fallbackUrl;
          el.load();
          if (playingRef.current) void el.play().catch(() => undefined);
        },
        { once: true }
      );
    }
    el.src = playbackUrl;
    soundRef.current = el;
    if (playingRef.current) void el.play().catch(() => undefined);
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrack?.id, selectedTrack?.url, audioVolume, playerArmed]);

  useEffect(() => {
    const el = soundRef.current;
    if (!el) return;
    if (playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [playing]);

  const selectTrack = (track: PostMusicTrack | null) => {
    setAudioTrackId(track?.id ?? null);
  };

  const togglePlay = async () => {
    const end = clipEndMs(trimEndMs, durationMs);
    const from = playFromMs(positionMs, trimStartMs, end);
    if (Platform.OS === 'web') {
      const el = htmlVideoRef.current;
      if (!el) return;
      if (el.paused) {
        el.currentTime = from / 1000;
        setPositionMs(from);
        try {
          await el.play();
        } catch {
          /* autoplay */
        }
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
      return;
    }
    if (playingRef.current) {
      setPlaying(false);
      return;
    }
    setPositionMs(from);
    setPlayHeadSeekMs(from);
    setSeekGeneration((g) => g + 1);
    if (!shouldMountNativePlayer(userPressedPlay)) {
      setUserPressedPlay(true);
      setPlayerArmed(true);
      setLoading(true);
    }
    setPlaying(true);
  };

  useEffect(() => {
    videoReady.current = false;
    setPlayerReady(false);
    if (Platform.OS !== 'web') {
      setPlayerArmed(false);
      setUserPressedPlay(false);
      setPlaying(false);
      setLoading(false);
    }
  }, [videoUri]);

  useEffect(() => {
    if (Platform.OS !== 'web' || durationMs < 200 || !videoUri) return;
    let cancelled = false;
    void extractVideoFrames(
      videoUri,
      durationMs,
      frameCountForDuration(durationMs),
      (partial) => {
        if (cancelled) return;
        setStripFrames(partial);
        const still = partial.find((f) => f.uri && !f.placeholder)?.uri;
        if (still) setStillUri(still);
      }
    ).then((frames) => {
      if (cancelled) return;
      setStripFrames(frames);
      const still = frames.find((f) => f.uri && !f.placeholder)?.uri;
      if (still) setStillUri(still);
    });
    return () => {
      cancelled = true;
    };
  }, [videoUri, durationMs]);

  const seekTo = useCallback(
    async (ms: number) => {
      const clamped = Math.max(0, Math.min(durationMs || ms, ms));
      setPlaying(false);
      setPositionMs(clamped);
      setPlayHeadSeekMs(clamped);
      setSeekGeneration((g) => g + 1);
      if (Platform.OS === 'web' && htmlVideoRef.current) {
        htmlVideoRef.current.pause();
        htmlVideoRef.current.currentTime = clamped / 1000;
      }
    },
    [durationMs]
  );

  const addText = (text?: string) => {
    if (overlays.length >= MAX_TEXT_OVERLAYS) {
      void alertMessage(
        'Text limit reached',
        `You can add up to ${MAX_TEXT_OVERLAYS} text layers. Remove one to add another.`
      );
      return;
    }
    const o = newOverlay(text || 'GROW');
    setOverlays((prev) => [...prev, o]);
    setActiveOverlayId(o.id);
    setTab('edit');
  };

  const updateActive = (patch: Partial<TextOverlay>) => {
    if (!activeOverlayId) return;
    setOverlays((prev) =>
      prev.map((o) => (o.id === activeOverlayId ? { ...o, ...patch } : o))
    );
  };

  const removeActive = () => {
    if (!activeOverlayId) return;
    setOverlays((prev) => prev.filter((o) => o.id !== activeOverlayId));
    setActiveOverlayId(null);
  };

  const finishAndSave = useCallback(async () => {
    if (doneBusyRef.current) return;
    doneBusyRef.current = true;
    setDoneBusy(true);
    feedback.commit();
    try {
      if (Platform.OS === 'web') {
        htmlVideoRef.current?.pause();
      } else {
        setPlaying(false);
        setPlayerArmed(false);
        setUserPressedPlay(false);
      }
      if (soundRef.current) {
        const el = soundRef.current;
        soundRef.current = null;
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    } finally {
      try {
        await onSave(buildSettings());
      } finally {
        doneBusyRef.current = false;
        if (mountedRef.current) setDoneBusy(false);
      }
    }
  }, [buildSettings, onSave]);

  const resetAll = () => {
    setOriginalVolume(1);
    setSpeed(1);
    setTrimStartMs(0);
    setTrimEndMs(durationMs || 0);
    setCoverMs(0);
    setFlipH(false);
    setFlipV(false);
    setLookId('none');
    setFilterPresetId(null);
    setManualAdjust({ ...DEFAULT_ADJUSTMENTS });
    setAudioTrackId(null);
    setAudioVolume(0.85);
    setOverlays([]);
    setActiveOverlayId(null);
  };

  const hasUnsavedChanges =
    Math.abs(originalVolume - initialSnap.originalVolume) > 0.001 ||
    speed !== initialSnap.speed ||
    trimStartMs !== initialSnap.trimStartMs ||
    clipEndMs(trimEndMs, durationMs) !== clipEndMs(initialSnap.trimEndMs, durationMs) ||
    coverMs !== initialSnap.coverMs ||
    flipH !== initialSnap.flipH ||
    flipV !== initialSnap.flipV ||
    lookId !== initialSnap.lookId ||
    filterPresetId !== initialSnap.filterPresetId ||
    JSON.stringify(manualAdjust) !==
      JSON.stringify({ ...DEFAULT_ADJUSTMENTS, ...initialSnap.manualAdjust }) ||
    audioTrackId !== initialTrackId ||
    Math.abs(audioVolume - initialSnap.audioVolume) > 0.001 ||
    JSON.stringify(overlays) !== JSON.stringify(initialSnap.overlays);

  /** Shell has already confirmed the discard (and played the close haptic). */
  const closeEditor = useCallback(() => {
    setPlaying(false);
    setPlayerArmed(false);
    onCancel();
  }, [onCancel]);

  const onDone = useCallback(() => {
    void finishAndSave();
  }, [finishAndSave]);

  const onTitleLongPress = useCallback(() => {
    feedback.egg();
  }, []);

  const flipTransform = [
    { scaleX: flipH ? -1 : 1 },
    { scaleY: flipV ? -1 : 1 },
  ];
  const webFlip =
    [flipH ? 'scaleX(-1)' : '', flipV ? 'scaleY(-1)' : ''].filter(Boolean).join(' ') || undefined;

  const clipPreparing =
    Platform.OS === 'web' ? loading : playerArmed && loading && !scrubSource;

  const subtitle =
    durationMs > 0
      ? `${formatMs(Math.max(0, (effectiveEnd || durationMs) - trimStartMs))} · Pro editor`
      : 'Pro editor';

  const stage = (
    <>
        {/* Preview — 9:16 frame, video fills it */}
        <View
          style={[
            tw`mx-3 items-center justify-center`,
            { height: maxPreviewH },
          ]}
        >
          <View
            style={[
              tw`rounded-3xl overflow-hidden bg-stone-950 border border-white/10`,
              { width: reelStage.width, height: reelStage.height, position: 'relative' },
            ]}
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              if (width > 0 && height > 0) setPreviewSize({ w: width, h: height });
            }}
          >
          {Platform.OS === 'web'
            ? React.createElement('video', {
                ref: htmlVideoRef,
                key: videoUri,
                src: videoUri,
                muted: isOriginalMuted,
                loop: !(trimEndMs > 0),
                playsInline: true,
                autoPlay: playing,
                controls: false,
                preload: 'auto',
                className: 'grow-video-cover',
                onTimeUpdate: onWebTimeUpdate,
                onLoadedMetadata: onWebTimeUpdate,
                style: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center center',
                  backgroundColor: '#000',
                  filter: webFilter,
                  transform: webFlip,
                },
              })
            : (
              <>
                {scrubSource ? (
                  <Image
                    source={scrubSource as { uri: string }}
                    style={[
                      StyleSheet.absoluteFillObject,
                      {
                        transform: flipTransform,
                        zIndex: playing ? 0 : 6,
                        opacity: playing ? 0 : 1,
                      },
                    ]}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      tw`bg-black items-center justify-center`,
                    ]}
                  >
                    <Ionicons name="play" size={36} color="#FFFFFF" />
                  </View>
                )}
                {playerArmed ? (
                  <View
                    style={[
                      StyleSheet.absoluteFillObject,
                      { transform: flipTransform, zIndex: 1 },
                    ]}
                  >
                    <NativeClipPlayer
                      uri={videoUri}
                      shouldPlay={playing}
                      loop={false}
                      seekMs={playHeadSeekMs}
                      seekGeneration={seekGeneration}
                      muted={isOriginalMuted}
                      volume={isOriginalMuted ? 0 : originalVolume}
                      playbackRate={speed || 1}
                      contentFit="cover"
                      onProgress={onNativeProgress}
                      onReady={onNativeReady}
                      onEnded={onNativeEnded}
                    />
                  </View>
                ) : null}
              </>
            )}

          <VideoGradeStack edit={editPreview} />

          {clipPreparing ? (
            // Under the play button (z-20) so play/pause stays reachable.
            <EditorLoadingState
              subject="clip"
              status="preparing"
              width={previewSize.w}
              height={previewSize.h}
              aspect="9:16"
              reducedMotion={reducedMotion}
              style={{ zIndex: 15 }}
            />
          ) : null}

          <View
            pointerEvents="box-none"
            style={tw`absolute bottom-3 left-0 right-0 items-center z-20`}
          >
            <Pressable
              onPress={() => void togglePlay()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              style={tw`w-12 h-12 rounded-full bg-black/70 items-center justify-center border border-white/20`}
            >
              <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#fff" />
            </Pressable>
          </View>

          {coverMs > 0 && Math.abs(positionMs - coverMs) < 120 ? (
            <View style={tw`absolute top-3 left-3 bg-brand-600/90 px-2.5 py-1 rounded-full z-10`}>
              <Text maxFontSizeMultiplier={1.3} style={tw`text-white text-[11px] font-bold`}>COVER</Text>
            </View>
          ) : null}

          {/* Text always draggable — not gated on the Text tab */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            {overlays.map((o) =>
              o.text.trim() ? (
                <DraggableTextOverlay
                  key={o.id}
                  overlay={o}
                  selected={activeOverlayId === o.id}
                  containerW={previewSize.w}
                  containerH={previewSize.h}
                  editable
                  onSelect={() => {
                    setActiveOverlayId(o.id);
                    setTab('edit');
                  }}
                  onMove={(x, y) => {
                    setOverlays((prev) =>
                      prev.map((item) => (item.id === o.id ? { ...item, x, y } : item))
                    );
                  }}
                />
              ) : null
            )}
          </View>
          </View>
        </View>

        {/* Timeline readout */}
        <View style={tw`px-4 pt-2 flex-row justify-between`}>
          <Text style={tw`text-stone-400 text-[11px] font-semibold`}>
            {formatMs(positionMs)}
          </Text>
          <Text style={tw`text-stone-600 text-[11px]`}>9:16 · vertical</Text>
          <Text style={tw`text-stone-400 text-[11px] font-semibold`}>
            {formatMs(effectiveEnd || durationMs)}
          </Text>
        </View>

    </>
  );

  return (
    <EditorShell
      title={title}
      subtitle={subtitle}
      onTitleLongPress={onTitleLongPress}
      hasUnsavedChanges={hasUnsavedChanges}
      discardMessage="Your changes to this clip will be lost."
      onCancel={closeEditor}
      closeDisabled={doneBusy}
      onDone={onDone}
      saving={showSaving}
      savingLabel="Saving your edits…"
      savingDetail="Keep the app open"
      stage={stage}
      tools={
        // Stories only get trim, so no tab bar there.
        isStory ? (
          <Text style={tw`text-stone-400 text-[11px] text-center px-6 pt-2`}>
            Stories keep your trim. Looks, text, sound and speed are for reels.
          </Text>
        ) : (
          <EditorToolTabs tabs={TABS} value={tab} onChange={setTab} disabled={doneBusy} />
        )
      }
    >
        {tab === 'edit' ? (
          <ScrollView
            style={tw`flex-1 px-4`}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={tw`text-stone-400 text-xs mb-3 pt-2`}>
              White IN / OUT trim what loops in the feed. Yellow playhead scrubs. Gray is outside the cut.
            </Text>
            <FilmstripTrimmer
              videoUri={videoUri}
              durationMs={durationMs}
              trimStartMs={trimStartMs}
              trimEndMs={effectiveEnd || durationMs}
              positionMs={positionMs}
              frames={stripFrames}
              onChangeTrim={(start, end) => {
                setTrimStartMs(start);
                setTrimEndMs(end);
              }}
              onSeek={(ms) => void seekTo(ms)}
            />

            {!isStory ? (
            <View style={tw`mt-5 pt-4 border-t border-stone-800`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-white text-sm font-bold`}>Text</Text>
                <Pressable
                  onPress={() => addText()}
                  accessibilityRole="button"
                  accessibilityLabel="Add text"
                  style={tw`flex-row items-center gap-1 bg-brand-600 px-3 py-2 rounded-full`}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={tw`text-white text-xs font-bold`}>Add</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`}>
                {TEXT_QUICK_PHRASES.map((phrase) => (
                  <Pressable
                    key={phrase}
                    onPress={() => {
                      if (activeOverlay) updateActive({ text: phrase });
                      else addText(phrase);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Use phrase ${phrase}`}
                    style={tw`px-3 py-2 rounded-full bg-stone-800 border border-stone-700 mr-2`}
                  >
                    <Text style={tw`text-stone-200 text-xs font-semibold`}>{phrase}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {activeOverlay ? (
                <>
                  <TextInput
                    {...formInputAccessoryProps()}
                    value={activeOverlay.text}
                    onChangeText={(t) => updateActive({ text: t.slice(0, 48) })}
                    placeholder="Type your text…"
                    placeholderTextColor="#78716C"
                    style={tw`bg-stone-900 text-white rounded-2xl px-4 py-3.5 mb-3 border border-stone-700`}
                    maxLength={48}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`}>
                    {TEXT_STYLES.map((s) => {
                      const selected = activeOverlay.style === s.id;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => updateActive({ style: s.id })}
                          accessibilityRole="button"
                          accessibilityLabel={`${s.label} text style`}
                          accessibilityState={{ selected }}
                          style={[
                            tw`px-3 py-2 rounded-xl border mr-2`,
                            selected
                              ? tw`bg-brand-600/25 border-brand-500`
                              : tw`bg-stone-900 border-stone-700`,
                          ]}
                        >
                          <Text
                            style={tw`text-xs font-bold ${
                              selected ? 'text-brand-300' : 'text-white'
                            }`}
                          >
                            {s.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <AdjustSlider
                    label="Size"
                    value={Math.round((activeOverlay.scale || 1) * 100)}
                    min={70}
                    max={180}
                    onChange={(v) => updateActive({ scale: v / 100 })}
                  />
                </>
              ) : (
                <Text style={tw`text-stone-400 text-xs mb-3`}>
                  Drag text on the preview from any tab.
                </Text>
              )}
            </View>
            ) : null}

            <View style={tw`mt-5 pt-4 border-t border-stone-800 pb-2`}>
              {!isStory ? (
              <>
              <Text style={tw`text-white text-sm font-bold mb-3`}>Tools</Text>
              <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
                Speed
              </Text>
              <View style={tw`flex-row flex-wrap gap-2 mb-5`}>
                {SPEED_PRESETS.map((s) => {
                  const selected = speed === s.value;
                  return (
                    <Pressable
                      key={s.value}
                      onPress={() => setSpeed(s.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Speed ${s.label}`}
                      accessibilityState={{ selected }}
                      style={[
                        tw`px-3.5 py-2.5 rounded-2xl border min-w-[72px]`,
                        selected
                          ? tw`bg-brand-600/30 border-brand-500`
                          : tw`bg-stone-900 border-stone-700`,
                      ]}
                    >
                      <Text
                        style={tw`text-sm font-bold ${
                          selected ? 'text-brand-300' : 'text-stone-200'
                        }`}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={tw`flex-row gap-3 mb-4`}>
                <Pressable
                  onPress={() => setFlipH((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Flip horizontally"
                  accessibilityState={{ selected: flipH }}
                  style={[
                    tw`flex-1 flex-row items-center justify-center py-3 rounded-2xl border`,
                    flipH ? tw`bg-brand-600/25 border-brand-500` : tw`bg-stone-900 border-stone-700`,
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={18} color={flipH ? '#34D399' : '#fff'} />
                  <Text style={tw`text-white text-xs font-bold ml-2`}>Flip H</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFlipV((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Flip vertically"
                  accessibilityState={{ selected: flipV }}
                  style={[
                    tw`flex-1 flex-row items-center justify-center py-3 rounded-2xl border`,
                    flipV ? tw`bg-brand-600/25 border-brand-500` : tw`bg-stone-900 border-stone-700`,
                  ]}
                >
                  <Ionicons name="swap-vertical" size={18} color={flipV ? '#34D399' : '#fff'} />
                  <Text style={tw`text-white text-xs font-bold ml-2`}>Flip V</Text>
                </Pressable>
              </View>
              <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2 mt-2`}>
                Cover frame
              </Text>
              <View style={tw`bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 mb-4`}>
                <Pressable
                  onPress={() => setCoverMs(positionMs)}
                  accessibilityRole="button"
                  style={tw`py-3 rounded-xl bg-brand-600 items-center`}
                >
                  <Text style={tw`text-white font-bold text-sm`}>
                    Use {formatMs(positionMs)} as cover
                  </Text>
                </Pressable>
                {coverMs > 0 ? (
                  <Text style={tw`text-brand-400 text-xs font-semibold mt-2`}>
                    Cover at {formatMs(coverMs)}
                  </Text>
                ) : null}
              </View>
              </>
              ) : null}
              <Pressable
                onPress={resetAll}
                accessibilityRole="button"
                style={tw`flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-stone-700 bg-stone-900`}
              >
                <Ionicons name="refresh-outline" size={18} color="#A8A29E" />
                <Text style={tw`text-stone-300 font-semibold text-sm`}>Reset all edits</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            style={tw`flex-1 px-4`}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {tab === 'look' && (
              <VideoLookPanel
                lookId={lookId}
                filterPresetId={filterPresetId}
                manualAdjust={manualAdjust}
                stillUri={scrubStill}
                stillSource={scrubSource}
                onLookIdChange={setLookId}
                onPresetChange={setFilterPresetId}
                onAdjustChange={(patch) =>
                  setManualAdjust((prev) => ({ ...prev, ...patch }))
                }
                onResetLooks={() => {
                  setLookId('none');
                  setFilterPresetId(null);
                  setManualAdjust({ ...DEFAULT_ADJUSTMENTS });
                }}
              />
            )}

            {tab === 'audio' && (
              <View style={tw`pt-2`}>
                <Text style={tw`text-white text-sm font-bold mb-1`}>Mix</Text>
                <Text style={tw`text-stone-400 text-xs mb-3`}>
                  Music overlaps original sound by default — balance both levels
                </Text>

                <AdjustSlider
                  label="Original voice"
                  value={Math.round(originalVolume * 100)}
                  min={0}
                  max={100}
                  onChange={(v) => setOriginalVolume(v / 100)}
                />
                <Pressable
                  onPress={() => setOriginalVolume(isOriginalMuted ? 1 : 0)}
                  accessibilityRole="button"
                  accessibilityLabel={isOriginalMuted ? 'Unmute original sound' : 'Mute original sound'}
                  style={tw`self-start flex-row items-center gap-2 mb-4 -mt-1`}
                >
                  <Ionicons
                    name={isOriginalMuted ? 'mic-off-outline' : 'mic-outline'}
                    size={16}
                    color={isOriginalMuted ? '#F87171' : '#A8A29E'}
                  />
                  <Text
                    style={tw`text-xs font-semibold ${
                      isOriginalMuted ? 'text-red-400' : 'text-stone-400'
                    }`}
                  >
                    {isOriginalMuted ? 'Original muted' : 'Mute original'}
                  </Text>
                </Pressable>

                {!MUSIC_PLAYBACK_SUPPORTED ? (
                  <View style={tw`bg-stone-900 border border-stone-800 rounded-2xl px-4 py-3 mb-3`}>
                    <Text style={tw`text-stone-300 text-xs font-semibold`}>
                      Music isn't available in the app yet
                    </Text>
                    <Text style={tw`text-stone-400 text-[11px] mt-1`}>
                      The app can't play soundtracks, so adding music is web-only for now.
                    </Text>
                    {selectedTrack ? (
                      <Pressable
                        onPress={() => selectTrack(null)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove music ${selectedTrack.title}`}
                        style={tw`self-start mt-2 flex-row items-center gap-1.5`}
                      >
                        <Ionicons name="close-circle-outline" size={16} color="#F87171" />
                        <Text style={tw`text-red-400 text-xs font-semibold`}>
                          Remove "{selectedTrack.title}"
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                <>
                <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
                  Music library
                </Text>
                <Text style={tw`text-stone-400 text-[11px] mb-2`}>
                  Royalty-free tracks styled like popular moods — not licensed chart hits
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`}>
                  {MUSIC_GENRE_FILTERS.map((g) => {
                    const selected = musicGenre === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setMusicGenre(g)}
                        accessibilityRole="button"
                        accessibilityLabel={`${g} music`}
                        accessibilityState={{ selected }}
                        style={[
                          tw`px-3 py-1.5 rounded-full mr-2 border`,
                          selected
                            ? tw`bg-brand-600/30 border-brand-500`
                            : tw`bg-stone-900 border-stone-700`,
                        ]}
                      >
                        <Text
                          style={tw`text-[11px] font-bold ${
                            selected ? 'text-brand-300' : 'text-stone-300'
                          }`}
                        >
                          {g}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Pressable
                  onPress={() => selectTrack(null)}
                  accessibilityRole="button"
                  accessibilityLabel="No music"
                  accessibilityState={{ selected: !selectedTrack }}
                  style={[
                    tw`flex-row items-center rounded-2xl px-3 py-3 mb-2 border`,
                    !selectedTrack
                      ? tw`bg-brand-600/20 border-brand-500`
                      : tw`bg-stone-900 border-stone-800`,
                  ]}
                >
                  <View style={tw`w-10 h-10 rounded-xl bg-white/10 items-center justify-center`}>
                    <Ionicons name="musical-notes-outline" size={18} color="#A8A29E" />
                  </View>
                  <Text style={tw`ml-3 text-white font-semibold flex-1`}>No music</Text>
                  {!selectedTrack ? (
                    <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                  ) : null}
                </Pressable>

                {libraryTracks.map((track) => {
                  const active = selectedTrack?.id === track.id;
                  return (
                    <Pressable
                      key={track.id}
                      onPress={() => selectTrack(track)}
                      accessibilityRole="button"
                      accessibilityLabel={`${track.title} by ${track.artist}`}
                      accessibilityState={{ selected: active }}
                      style={[
                        tw`flex-row items-center rounded-2xl px-3 py-3 mb-2 border`,
                        active
                          ? tw`bg-brand-600/20 border-brand-500`
                          : tw`bg-stone-900 border-stone-800`,
                      ]}
                    >
                      <View
                        style={[
                          tw`w-10 h-10 rounded-xl items-center justify-center`,
                          active ? tw`bg-brand-600` : tw`bg-white/10`,
                        ]}
                      >
                        <Ionicons name="musical-notes" size={18} color="#fff" />
                      </View>
                      <View style={tw`ml-3 flex-1`}>
                        <Text style={tw`text-white font-semibold`}>{track.title}</Text>
                        <Text style={tw`text-stone-400 text-xs mt-0.5`}>
                          {track.artist}
                          {track.mood ? ` · ${track.mood}` : ''}
                          {track.genre ? ` · ${track.genre}` : ''}
                        </Text>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                      ) : null}
                    </Pressable>
                  );
                })}

                {hasSoundtrack ? (
                  <View style={tw`mt-2`}>
                    <AdjustSlider
                      label="Music volume"
                      value={Math.round(audioVolume * 100)}
                      min={0}
                      max={100}
                      onChange={(v) => setAudioVolume(v / 100)}
                    />
                  </View>
                ) : null}
                </>
                )}
              </View>
            )}
          </ScrollView>
        )}
    </EditorShell>
  );
}
