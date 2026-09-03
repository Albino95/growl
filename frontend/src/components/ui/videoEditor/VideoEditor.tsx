import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, Audio, AVPlaybackStatus, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import type { TextOverlay, TextOverlayStyle, EditAdjustments } from '../photoEditor/types';
import { TEXT_COLORS, TEXT_QUICK_PHRASES, DEFAULT_ADJUSTMENTS } from '../photoEditor/types';
import DraggableTextOverlay from '../photoEditor/DraggableTextOverlay';
import { AdjustSlider } from '../photoEditor/AdjustSlider';
import type { VideoEditSettings, VideoLookId } from './types';
import {
  DEFAULT_VIDEO_EDIT,
  SPEED_PRESETS,
  getVideoLook,
  normalizeVideoEdit,
} from './types';
import FilmstripTrimmer from './FilmstripTrimmer';
import VideoLookPanel from './VideoLookPanel';
import { buildVideoCssFilter, videoVignetteStrength, videoCinematicStrength, videoFadeOpacity } from './videoFilters';
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

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'edit', label: 'Edit', icon: 'cut-outline' },
  { id: 'look', label: 'Look', icon: 'color-filter-outline' },
  { id: 'audio', label: 'Sound', icon: 'musical-notes-outline' },
];

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
  onSave: (settings: VideoEditSettings) => void;
  onCancel: () => void;
};

export default function VideoEditor({
  videoUri,
  initialSettings,
  title = 'Edit Reel',
  onSave,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const maxPreviewW = winW - 24;
  const maxPreviewH = Math.min(winH * 0.46, maxPreviewW * (16 / 9));
  const reelStage = fitReelStage(maxPreviewW, maxPreviewH);
  const initial = normalizeVideoEdit(initialSettings);
  const videoRef = useRef<Video>(null);
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
  const soundRef = useRef<Audio.Sound | null>(null);

  const [tab, setTab] = useState<Tab>('edit');
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
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

  const selectedTrack = getMusicTrackById(audioTrackId);
  const soundtrackUrl = getMusicPlaybackUrl(selectedTrack?.id, selectedTrack?.url);
  const hasSoundtrack = Boolean(soundtrackUrl);
  const libraryTracks = getPrimaryMusicTracks().filter(
    (t) => musicGenre === 'All' || t.genre === musicGenre
  );
  const look = getVideoLook(lookId);
  const editPreview: VideoEditSettings = {
    ...normalizeVideoEdit({ lookId, filterPresetId, manualAdjust }),
    lookId,
    filterPresetId,
    manualAdjust,
  } as VideoEditSettings;
  const webFilter = Platform.OS === 'web' ? buildVideoCssFilter(editPreview) : undefined;
  const vignetteStrength = videoVignetteStrength(editPreview);
  const cinematicStrength = videoCinematicStrength(editPreview);
  const fadeOverlay = videoFadeOpacity(editPreview);
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;
  const effectiveEnd = trimEndMs > 0 ? trimEndMs : durationMs;
  const isOriginalMuted = originalVolume <= 0.001;

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

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setLoading(false);
      setPlaying(status.isPlaying);
      setPositionMs(status.positionMillis || 0);
      const dur = status.durationMillis || 0;
      if (dur > 0) {
        setDurationMs((prev) => (Math.abs(prev - dur) > 50 ? dur : prev));
        setTrimEndMs((prev) => (prev <= 0 || prev > dur ? dur : prev));
      }
      const end = trimEndMs > 0 ? trimEndMs : dur;
      if (end > 0 && (status.positionMillis || 0) >= end - 80) {
        void videoRef.current?.setPositionAsync(trimStartMs);
        if (soundRef.current) void soundRef.current.setPositionAsync(0);
      }
    },
    [trimEndMs, trimStartMs]
  );

  const applyWebDuration = useCallback((durationSec: number) => {
    if (!durationSec || !Number.isFinite(durationSec)) return;
    const dur = durationSec * 1000;
    setDurationMs((prev) => (Math.abs(prev - dur) > 50 ? dur : prev));
    setTrimEndMs((prev) => (prev <= 0 || prev > dur ? dur : prev));
  }, []);

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
      if (soundRef.current) void soundRef.current.setPositionAsync(0);
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
    void videoRef.current?.setIsMutedAsync(isOriginalMuted);
    if (!isOriginalMuted) {
      void videoRef.current?.setVolumeAsync(originalVolume);
    }
  }, [isOriginalMuted, originalVolume]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      if (htmlVideoRef.current) htmlVideoRef.current.playbackRate = speed;
      return;
    }
    void videoRef.current?.setRateAsync(speed, true);
  }, [speed]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {
          /* ignore */
        }
        soundRef.current = null;
      }
      if (!selectedTrack?.id && !selectedTrack?.url) return;
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        let playbackUrl = getMusicPlaybackUrl(selectedTrack.id, selectedTrack.url);
        if (!playbackUrl) return;
        let sound: Audio.Sound;
        try {
          ({ sound } = await Audio.Sound.createAsync(
            { uri: playbackUrl },
            { shouldPlay: playing, isLooping: true, volume: audioVolume }
          ));
        } catch {
          // Proxy may be undeployed — fall back to upstream URL
          if (selectedTrack.url && selectedTrack.url !== playbackUrl) {
            ({ sound } = await Audio.Sound.createAsync(
              { uri: selectedTrack.url },
              { shouldPlay: playing, isLooping: true, volume: audioVolume }
            ));
          } else {
            throw new Error('soundtrack load failed');
          }
        }
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch {
        soundRef.current = null;
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [selectedTrack?.id, selectedTrack?.url, audioVolume]);

  useEffect(() => {
    if (!soundRef.current) return;
    if (playing) void soundRef.current.playAsync();
    else void soundRef.current.pauseAsync();
  }, [playing]);

  const selectTrack = (track: PostMusicTrack | null) => {
    setAudioTrackId(track?.id ?? null);
  };

  const togglePlay = async () => {
    if (Platform.OS === 'web') {
      const el = htmlVideoRef.current;
      if (!el) return;
      if (el.paused) {
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
    const v = videoRef.current;
    if (!v) return;
    const status = await v.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await v.pauseAsync();
    else await v.playAsync();
  };

  const seekTo = useCallback(
    async (ms: number) => {
      const clamped = Math.max(0, Math.min(durationMs || ms, ms));
      setPositionMs(clamped);
      if (Platform.OS === 'web') {
        if (htmlVideoRef.current) htmlVideoRef.current.currentTime = clamped / 1000;
        return;
      }
      await videoRef.current?.setPositionAsync(clamped);
    },
    [durationMs]
  );

  const addText = (text?: string) => {
    const o = newOverlay(text || 'GROW');
    setOverlays((prev) => [...prev.slice(0, 4), o]);
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

  const flipTransform = [
    { scaleX: flipH ? -1 : 1 },
    { scaleY: flipV ? -1 : 1 },
  ];
  const webFlip =
    [flipH ? 'scaleX(-1)' : '', flipV ? 'scaleY(-1)' : ''].filter(Boolean).join(' ') || undefined;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={tw`flex-1 bg-black`} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3`}>
          <Pressable
            onPress={onCancel}
            hitSlop={10}
            style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <View style={tw`items-center`}>
            <Text style={tw`text-white text-base font-bold`}>{title}</Text>
            <Text style={tw`text-stone-500 text-[10px] mt-0.5`}>
              {durationMs > 0
                ? `${formatMs(Math.max(0, (effectiveEnd || durationMs) - trimStartMs))} · Pro editor`
                : 'Pro editor'}
            </Text>
          </View>
          <Pressable
            onPress={() => onSave(buildSettings())}
            style={tw`px-4 py-2 rounded-full bg-brand-600`}
            hitSlop={6}
          >
            <Text style={tw`text-white font-bold text-sm`}>Done</Text>
          </Pressable>
        </View>

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
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={[
              StyleSheet.absoluteFillObject,
              { transform: flipTransform },
            ]}
            resizeMode={ResizeMode.COVER}
            shouldPlay={playing}
            isLooping={false}
            isMuted={isOriginalMuted}
            volume={isOriginalMuted ? 0 : originalVolume}
            onPlaybackStatusUpdate={onStatus}
            useNativeControls={false}
            onLoadStart={() => setLoading(true)}
          />
            )}

          {look.layers.map((layer, i) => (
            <View
              key={`${look.id}-${i}`}
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: layer.color, opacity: layer.opacity ?? 1 },
              ]}
            />
          ))}
          {vignetteStrength > 0 ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: `rgba(0,0,0,${vignetteStrength * 0.35})` },
              ]}
            />
          ) : null}
          {fadeOverlay > 0 ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(255,255,255,${fadeOverlay})` }]}
            />
          ) : null}
          {cinematicStrength > 0 ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <View
                style={[
                  tw`absolute top-0 left-0 right-0`,
                  {
                    height: `${12 + cinematicStrength * 18}%`,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                  },
                ]}
              />
              <View
                style={[
                  tw`absolute bottom-0 left-0 right-0`,
                  {
                    height: `${14 + cinematicStrength * 20}%`,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                  },
                ]}
              />
            </View>
          ) : null}

          {loading && (
            <View
              pointerEvents="none"
              style={tw`absolute inset-0 items-center justify-center bg-black/40 z-30`}
            >
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}

          <Pressable
            onPress={() => void togglePlay()}
            hitSlop={8}
            style={tw`absolute top-3 right-3 w-11 h-11 rounded-full bg-black/55 items-center justify-center z-20`}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#fff" />
          </Pressable>

          {coverMs > 0 && Math.abs(positionMs - coverMs) < 120 ? (
            <View style={tw`absolute top-3 left-3 bg-brand-600/90 px-2.5 py-1 rounded-full z-20`}>
              <Text style={tw`text-white text-[10px] font-bold`}>COVER</Text>
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
          <Text style={tw`text-stone-500 text-[11px] font-semibold`}>
            {formatMs(positionMs)}
          </Text>
          <Text style={tw`text-stone-600 text-[11px]`}>9:16 · vertical</Text>
          <Text style={tw`text-stone-500 text-[11px] font-semibold`}>
            {formatMs(effectiveEnd || durationMs)}
          </Text>
        </View>

        {/* Tabs */}
        <View style={tw`flex-row px-2 pt-2 pb-1`}>
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[
                  tw`flex-1 items-center py-2 mx-0.5 rounded-2xl`,
                  selected ? tw`bg-white/12` : tw`bg-transparent`,
                ]}
              >
                <Ionicons name={t.icon} size={18} color={selected ? '#34D399' : '#A8A29E'} />
                <Text
                  style={tw`text-[10px] font-semibold mt-1 ${
                    selected ? 'text-brand-300' : 'text-stone-500'
                  }`}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'edit' ? (
          <ScrollView
            style={tw`flex-1 px-4`}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={tw`text-stone-400 text-xs mb-3 pt-2`}>
              Drag handles to trim — only this range loops in the feed
            </Text>
            <FilmstripTrimmer
              videoUri={videoUri}
              durationMs={durationMs}
              trimStartMs={trimStartMs}
              trimEndMs={effectiveEnd || durationMs}
              positionMs={positionMs}
              onChangeTrim={(start, end) => {
                setTrimStartMs(start);
                setTrimEndMs(end);
              }}
              onSeek={(ms) => void seekTo(ms)}
            />

            <View style={tw`mt-5 pt-4 border-t border-stone-800`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-white text-sm font-bold`}>Text</Text>
                <Pressable
                  onPress={() => addText()}
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
                    style={tw`px-3 py-2 rounded-full bg-stone-800 border border-stone-700 mr-2`}
                  >
                    <Text style={tw`text-stone-200 text-xs font-semibold`}>{phrase}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {activeOverlay ? (
                <>
                  <TextInput
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
                <Text style={tw`text-stone-500 text-xs mb-3`}>
                  Drag text on the preview from any tab.
                </Text>
              )}
            </View>

            <View style={tw`mt-5 pt-4 border-t border-stone-800 pb-2`}>
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
              <Pressable
                onPress={resetAll}
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
                <Text style={tw`text-stone-500 text-xs mb-3`}>
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

                <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
                  Music library
                </Text>
                <Text style={tw`text-stone-500 text-[11px] mb-2`}>
                  Royalty-free tracks styled like popular moods — not licensed chart hits
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-3`}>
                  {MUSIC_GENRE_FILTERS.map((g) => {
                    const selected = musicGenre === g;
                    return (
                      <Pressable
                        key={g}
                        onPress={() => setMusicGenre(g)}
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
                        <Text style={tw`text-stone-500 text-xs mt-0.5`}>
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
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
