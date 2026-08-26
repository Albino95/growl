import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, Audio, AVPlaybackStatus, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import type { TextOverlay, TextOverlayStyle } from '../photoEditor/types';
import { TEXT_COLORS, TEXT_QUICK_PHRASES } from '../photoEditor/types';
import DraggableTextOverlay from '../photoEditor/DraggableTextOverlay';
import type { VideoEditSettings, VideoLookId } from './types';
import { DEFAULT_VIDEO_EDIT, VIDEO_LOOKS, getVideoLook } from './types';
import FilmstripTrimmer from './FilmstripTrimmer';
import {
  POST_MUSIC_TRACKS,
  getMusicTrackById,
  type PostMusicTrack,
} from '../../../constants/postMusic';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PREVIEW_H = Math.min(SCREEN_W * 1.35, SCREEN_H * 0.48);

type Tab = 'trim' | 'look' | 'audio' | 'text';

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'trim', label: 'Trim', icon: 'cut-outline' },
  { id: 'look', label: 'Look', icon: 'color-filter-outline' },
  { id: 'audio', label: 'Audio', icon: 'volume-high-outline' },
  { id: 'text', label: 'Text', icon: 'text-outline' },
];

const TEXT_STYLES: { id: TextOverlayStyle; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'bold', label: 'Bold' },
  { id: 'pill', label: 'Pill' },
  { id: 'neon', label: 'Neon' },
  { id: 'banner', label: 'Banner' },
];

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

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
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [tab, setTab] = useState<Tab>('trim');
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [previewSize, setPreviewSize] = useState({ w: SCREEN_W - 32, h: PREVIEW_H });
  const [muted, setMuted] = useState(initialSettings?.muted ?? DEFAULT_VIDEO_EDIT.muted);
  const [speed, setSpeed] = useState(initialSettings?.speed ?? DEFAULT_VIDEO_EDIT.speed);
  const [trimStartMs, setTrimStartMs] = useState(initialSettings?.trimStartMs ?? 0);
  const [trimEndMs, setTrimEndMs] = useState(initialSettings?.trimEndMs ?? 0);
  const [lookId, setLookId] = useState<VideoLookId>(
    initialSettings?.lookId ?? DEFAULT_VIDEO_EDIT.lookId
  );
  const [audioTrackId, setAudioTrackId] = useState<string | null>(
    initialSettings?.audioTrackId ||
      (initialSettings?.audioUrl
        ? POST_MUSIC_TRACKS.find((t) => t.url === initialSettings.audioUrl)?.id || null
        : null)
  );
  const [audioVolume] = useState(initialSettings?.audioVolume ?? 0.85);
  const [overlays, setOverlays] = useState<TextOverlay[]>(
    initialSettings?.overlays?.map((o) => ({ ...o })) ?? []
  );
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    initialSettings?.overlays?.[0]?.id ?? null
  );

  const effectiveEnd = trimEndMs > 0 ? trimEndMs : durationMs;
  const look = getVideoLook(lookId);
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;
  const selectedTrack = getMusicTrackById(audioTrackId);
  const hasSoundtrack = Boolean(selectedTrack);
  const webFilter = Platform.OS === 'web' ? look.cssFilter : undefined;

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setLoading(false);
      setPlaying(status.isPlaying);
      setPositionMs(status.positionMillis || 0);
      if (status.durationMillis && status.durationMillis !== durationMs) {
        setDurationMs(status.durationMillis);
        if (trimEndMs <= 0) setTrimEndMs(status.durationMillis);
      }
      const end = trimEndMs > 0 ? trimEndMs : status.durationMillis || 0;
      if (end > 0 && (status.positionMillis || 0) >= end - 80) {
        void videoRef.current?.setPositionAsync(trimStartMs);
      }
    },
    [durationMs, trimEndMs, trimStartMs]
  );

  useEffect(() => {
    // Original audio only mutes when opted in — soundtrack overlaps by default.
    void videoRef.current?.setIsMutedAsync(muted);
  }, [muted]);

  useEffect(() => {
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
      if (!selectedTrack?.url) return;
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: selectedTrack.url },
          { shouldPlay: playing, isLooping: true, volume: audioVolume }
        );
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
  }, [selectedTrack?.url, audioVolume]);

  useEffect(() => {
    if (!soundRef.current) return;
    if (playing) void soundRef.current.playAsync();
    else void soundRef.current.pauseAsync();
  }, [playing]);

  const selectTrack = (track: PostMusicTrack | null) => {
    setAudioTrackId(track?.id ?? null);
  };

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    const status = await v.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await v.pauseAsync();
    else await v.playAsync();
  };

  const seekTo = useCallback(async (ms: number) => {
    const clamped = Math.max(0, Math.min(durationMs || ms, ms));
    setPositionMs(clamped);
    await videoRef.current?.setPositionAsync(clamped);
  }, [durationMs]);

  const addText = (text?: string) => {
    const o = newOverlay(text || 'GROW');
    setOverlays((prev) => [...prev.slice(0, 4), o]);
    setActiveOverlayId(o.id);
    setTab('text');
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

  const handleDone = () => {
    const end = durationMs > 0 ? Math.min(effectiveEnd, durationMs) : trimEndMs;
    const start = Math.max(0, Math.min(trimStartMs, Math.max(0, end - 500)));
    onSave({
      muted,
      speed,
      trimStartMs: start,
      trimEndMs: end,
      lookId,
      overlays,
      audioTrackId: selectedTrack?.id ?? null,
      audioUrl: selectedTrack?.url ?? null,
      audioTitle: selectedTrack ? `${selectedTrack.title} · ${selectedTrack.artist}` : null,
      audioVolume,
    });
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={tw`flex-1 bg-black`} edges={['top', 'bottom']}>
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
            {durationMs > 0 ? (
              <Text style={tw`text-stone-500 text-[10px] mt-0.5`}>
                {formatMs(Math.max(0, effectiveEnd - trimStartMs))} clip
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={handleDone}
            style={tw`px-4 py-2 rounded-full bg-brand-600`}
            hitSlop={6}
          >
            <Text style={tw`text-white font-bold text-sm`}>Done</Text>
          </Pressable>
        </View>

        <View
          style={[
            tw`mx-3 rounded-3xl overflow-hidden bg-stone-950 border border-white/10`,
            { height: PREVIEW_H },
          ]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) setPreviewSize({ w: width, h: height });
          }}
        >
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={[StyleSheet.absoluteFillObject, webFilter ? ({ filter: webFilter } as object) : null]}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping={false}
            isMuted={muted}
            onPlaybackStatusUpdate={onStatus}
            useNativeControls={false}
            onLoadStart={() => setLoading(true)}
          />

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
          {(look.vignette || 0) > 0 ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: `rgba(0,0,0,${(look.vignette || 0) * 0.35})` },
              ]}
            />
          ) : null}
          {(look.cinematic || 0) > 0 ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <View
                style={[
                  tw`absolute top-0 left-0 right-0`,
                  {
                    height: `${12 + (look.cinematic || 0) * 18}%`,
                    backgroundColor: 'rgba(0,0,0,0.55)',
                  },
                ]}
              />
              <View
                style={[
                  tw`absolute bottom-0 left-0 right-0`,
                  {
                    height: `${14 + (look.cinematic || 0) * 20}%`,
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

          {!playing ? (
            <Pressable
              onPress={() => void togglePlay()}
              hitSlop={8}
              style={tw`absolute bottom-3 right-3 w-11 h-11 rounded-full bg-black/60 items-center justify-center z-20`}
            >
              <Ionicons name="play" size={22} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void togglePlay()}
              hitSlop={8}
              style={tw`absolute bottom-3 right-3 w-11 h-11 rounded-full bg-black/40 items-center justify-center z-20`}
            >
              <Ionicons name="pause" size={20} color="#fff" />
            </Pressable>
          )}

          {overlays.map((o) =>
            o.text.trim() ? (
              <DraggableTextOverlay
                key={o.id}
                overlay={o}
                selected={activeOverlayId === o.id}
                containerW={previewSize.w}
                containerH={previewSize.h}
                editable={tab === 'text'}
                onSelect={() => {
                  setActiveOverlayId(o.id);
                  setTab('text');
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

        <View style={tw`flex-row px-3 pt-3 pb-1`}>
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setTab(t.id)}
                style={[
                  tw`flex-1 items-center py-2.5 mx-0.5 rounded-2xl`,
                  selected ? tw`bg-white/12` : tw`bg-transparent`,
                ]}
              >
                <Ionicons name={t.icon} size={18} color={selected ? '#34D399' : '#A8A29E'} />
                <Text
                  style={tw`text-[11px] font-semibold mt-1 ${
                    selected ? 'text-brand-300' : 'text-stone-500'
                  }`}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={tw`flex-1 px-4`}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'trim' && (
            <View style={tw`pt-3`}>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-white text-sm font-bold`}>Trim clip</Text>
                <Pressable
                  onPress={() => void togglePlay()}
                  style={tw`flex-row items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full`}
                >
                  <Ionicons name={playing ? 'pause' : 'play'} size={14} color="#fff" />
                  <Text style={tw`text-white text-xs font-semibold`}>
                    {playing ? 'Pause' : 'Play'}
                  </Text>
                </Pressable>
              </View>
              <FilmstripTrimmer
                videoUri={videoUri}
                durationMs={durationMs || 1}
                trimStartMs={trimStartMs}
                trimEndMs={effectiveEnd}
                positionMs={positionMs}
                onChangeTrim={(start, end) => {
                  setTrimStartMs(start);
                  setTrimEndMs(end);
                }}
                onSeek={(ms) => void seekTo(ms)}
              />
            </View>
          )}

          {tab === 'look' && (
            <View style={tw`pt-2`}>
              <Text style={tw`text-white text-sm font-bold mb-1`}>Color grade</Text>
              <Text style={tw`text-stone-500 text-xs mb-3`}>
                Multi-layer looks with contrast, tone, and cinematic edges
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {VIDEO_LOOKS.map((l) => {
                  const selected = lookId === l.id;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => setLookId(l.id)}
                      style={tw`mr-3 items-center`}
                    >
                      <View
                        style={[
                          tw`w-[72px] h-24 rounded-2xl overflow-hidden border-2 items-center justify-center`,
                          {
                            backgroundColor: l.swatch,
                            borderColor: selected ? '#34D399' : '#44403C',
                          },
                        ]}
                      >
                        {l.layers.slice(0, 2).map((layer, idx) => (
                          <View
                            key={idx}
                            style={[
                              StyleSheet.absoluteFillObject,
                              { backgroundColor: layer.color },
                            ]}
                          />
                        ))}
                        {(l.cinematic || 0) > 0 ? (
                          <>
                            <View style={tw`absolute top-0 left-0 right-0 h-3 bg-black/50`} />
                            <View style={tw`absolute bottom-0 left-0 right-0 h-4 bg-black/55`} />
                          </>
                        ) : null}
                        {l.id === 'none' ? (
                          <Ionicons name="sparkles-outline" size={22} color="#E7E5E4" />
                        ) : null}
                      </View>
                      <Text
                        style={tw`text-[11px] font-bold mt-1.5 ${
                          selected ? 'text-brand-300' : 'text-stone-200'
                        }`}
                      >
                        {l.label}
                      </Text>
                      <Text style={tw`text-[10px] text-stone-500`}>{l.hint}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {tab === 'audio' && (
            <View style={tw`pt-2`}>
              <Text style={tw`text-white text-sm font-bold mb-1`}>Music library</Text>
              <Text style={tw`text-stone-500 text-xs mb-3 leading-5`}>
                Pick a track — it overlaps your original sound by default
              </Text>

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

              {POST_MUSIC_TRACKS.map((track) => {
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
                      </Text>
                    </View>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={20} color="#34D399" />
                    ) : null}
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setMuted((m) => !m)}
                style={tw`flex-row items-center justify-between bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 mt-3 mb-4`}
              >
                <View style={tw`flex-row items-center flex-1 mr-3`}>
                  <View style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3`}>
                    <Ionicons
                      name={muted ? 'mic-off-outline' : 'mic-outline'}
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-white font-semibold`}>Mute original voice</Text>
                    <Text style={tw`text-stone-500 text-xs mt-0.5`}>
                      {muted
                        ? 'Clip audio off — music only'
                        : hasSoundtrack
                          ? 'Overlapping with music'
                          : 'Clip audio on'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    tw`w-12 h-7 rounded-full px-0.5 justify-center`,
                    muted ? tw`bg-brand-600` : tw`bg-stone-700`,
                  ]}
                >
                  <View
                    style={[
                      tw`w-6 h-6 rounded-full bg-white`,
                      muted ? tw`self-end` : tw`self-start`,
                    ]}
                  />
                </View>
              </Pressable>

              <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-2`}>
                Speed
              </Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {SPEEDS.map((s) => {
                  const selected = speed === s;
                  return (
                    <Pressable
                      key={s}
                      onPress={() => setSpeed(s)}
                      style={[
                        tw`px-4 py-2.5 rounded-full border`,
                        selected
                          ? tw`bg-brand-600/30 border-brand-500`
                          : tw`bg-stone-900 border-stone-700`,
                      ]}
                    >
                      <Text
                        style={tw`text-sm font-bold ${
                          selected ? 'text-brand-300' : 'text-stone-300'
                        }`}
                      >
                        {s}×
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {tab === 'text' && (
            <View style={tw`pt-2`}>
              <View style={tw`bg-stone-900 border border-stone-800 rounded-2xl px-3 py-3 mb-3`}>
                <Text style={tw`text-stone-200 text-xs font-semibold text-center`}>
                  Press and drag text on the preview to place it
                </Text>
              </View>
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide`}>
                  On-clip text
                </Text>
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
                  <View style={tw`flex-row flex-wrap gap-2 mb-3`}>
                    {TEXT_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => updateActive({ color: c })}
                        style={[
                          tw`w-8 h-8 rounded-full border-2`,
                          {
                            backgroundColor: c,
                            borderColor: activeOverlay.color === c ? '#34D399' : '#44403C',
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Pressable onPress={removeActive} style={tw`flex-row items-center gap-2 py-2`}>
                    <Ionicons name="trash-outline" size={18} color="#F87171" />
                    <Text style={tw`text-red-400 font-semibold text-sm`}>Remove text</Text>
                  </Pressable>
                </>
              ) : (
                <View style={tw`bg-stone-900/80 border border-stone-800 rounded-2xl px-4 py-5`}>
                  <Text style={tw`text-stone-400 text-sm text-center`}>
                    Add a short label, then drag it anywhere on the clip.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
