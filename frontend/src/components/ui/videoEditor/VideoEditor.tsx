import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Slider from '@react-native-community/slider';
import { Video, AVPlaybackStatus, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import type { TextOverlay, TextOverlayStyle } from '../photoEditor/types';
import { TEXT_COLORS, TEXT_QUICK_PHRASES } from '../photoEditor/types';
import type { VideoEditSettings, VideoLookId } from './types';
import { DEFAULT_VIDEO_EDIT, VIDEO_LOOKS, getVideoLook } from './types';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = Math.min(SCREEN_W * 1.45, Dimensions.get('window').height * 0.58);

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
  const [tab, setTab] = useState<Tab>('trim');
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(initialSettings?.muted ?? DEFAULT_VIDEO_EDIT.muted);
  const [speed, setSpeed] = useState(initialSettings?.speed ?? DEFAULT_VIDEO_EDIT.speed);
  const [trimStartMs, setTrimStartMs] = useState(initialSettings?.trimStartMs ?? 0);
  const [trimEndMs, setTrimEndMs] = useState(initialSettings?.trimEndMs ?? 0);
  const [lookId, setLookId] = useState<VideoLookId>(
    initialSettings?.lookId ?? DEFAULT_VIDEO_EDIT.lookId
  );
  const [overlays, setOverlays] = useState<TextOverlay[]>(
    initialSettings?.overlays?.map((o) => ({ ...o })) ?? []
  );
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(
    initialSettings?.overlays?.[0]?.id ?? null
  );

  const effectiveEnd = trimEndMs > 0 ? trimEndMs : durationMs;
  const look = getVideoLook(lookId);
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;

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
    void videoRef.current?.setIsMutedAsync(muted);
  }, [muted]);

  useEffect(() => {
    void videoRef.current?.setRateAsync(speed, true);
  }, [speed]);

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    const status = await v.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) await v.pauseAsync();
    else await v.playAsync();
  };

  const seekTo = async (ms: number) => {
    const clamped = Math.max(trimStartMs, Math.min(effectiveEnd || ms, ms));
    setPositionMs(clamped);
    await videoRef.current?.setPositionAsync(clamped);
  };

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
    });
  };

  const progress =
    effectiveEnd > trimStartMs
      ? (positionMs - trimStartMs) / (effectiveEnd - trimStartMs)
      : 0;

  const webFilter = useMemo(() => {
    if (Platform.OS !== 'web') return undefined;
    if (look.grayscale) return 'grayscale(1) contrast(1.15)';
    if (lookId === 'pop') return 'saturate(1.35) contrast(1.1)';
    if (lookId === 'fade') return 'contrast(0.92) brightness(1.06)';
    if (lookId === 'cine') return 'contrast(1.12) saturate(0.9) brightness(0.95)';
    return undefined;
  }, [look.grayscale, lookId]);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <SafeAreaView style={tw`flex-1 bg-stone-950`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-4 py-3`}>
          <Pressable
            onPress={onCancel}
            hitSlop={10}
            style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={tw`text-white text-base font-bold`}>{title}</Text>
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
            tw`mx-4 rounded-3xl overflow-hidden bg-black border border-white/10`,
            { height: PREVIEW_H },
          ]}
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

          {look.wash ? (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: look.wash }]}
            />
          ) : null}
          {look.cinematic ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <View style={tw`absolute top-0 left-0 right-0 h-16 bg-black/50`} />
              <View style={tw`absolute bottom-0 left-0 right-0 h-20 bg-black/55`} />
            </View>
          ) : null}

          {overlays.map((o) =>
            o.text.trim() ? (
              <View
                key={o.id}
                pointerEvents="none"
                style={[
                  tw`absolute px-2 py-1`,
                  {
                    left: `${o.x * 100}%`,
                    top: `${o.y * 100}%`,
                    transform: [{ translateX: -50 }, { translateY: -14 }, { scale: o.scale }],
                    backgroundColor:
                      o.style === 'pill' || o.style === 'banner'
                        ? 'rgba(0,0,0,0.55)'
                        : 'transparent',
                    borderRadius: o.style === 'pill' ? 999 : o.style === 'banner' ? 4 : 0,
                    paddingHorizontal: o.style === 'banner' ? 12 : 4,
                    paddingVertical: o.style === 'banner' ? 5 : 2,
                  },
                ]}
              >
                <Text
                  style={{
                    color: o.color,
                    fontSize: o.style === 'bold' ? 22 : 18,
                    fontWeight: '800',
                    textAlign: o.align || 'center',
                    textShadowColor:
                      o.style === 'outline' || o.style === 'bold' || o.style === 'neon'
                        ? o.style === 'neon'
                          ? o.color
                          : 'rgba(0,0,0,0.9)'
                        : 'transparent',
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: o.style === 'neon' ? 10 : 4,
                  }}
                >
                  {o.text}
                </Text>
              </View>
            ) : null
          )}

          {loading && (
            <View style={tw`absolute inset-0 items-center justify-center bg-black/40`}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}

          <Pressable
            onPress={() => void togglePlay()}
            style={tw`absolute inset-0 items-center justify-center`}
          >
            {!playing ? (
              <View style={tw`w-16 h-16 rounded-full bg-black/55 items-center justify-center`}>
                <Ionicons name="play" size={32} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          <View style={tw`absolute left-3 right-3 bottom-3`}>
            <View style={tw`h-1 rounded-full bg-white/20 overflow-hidden mb-2`}>
              <View
                style={[
                  tw`h-full bg-brand-500 rounded-full`,
                  { width: `${Math.max(0, Math.min(1, progress)) * 100}%` },
                ]}
              />
            </View>
            <View style={tw`flex-row justify-between`}>
              <Text style={tw`text-white/80 text-xs font-semibold`}>
                {formatMs(positionMs)}
              </Text>
              <Text style={tw`text-white/60 text-xs`}>
                {formatMs(effectiveEnd || durationMs)}
              </Text>
            </View>
          </View>
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
                <Ionicons
                  name={t.icon}
                  size={18}
                  color={selected ? '#34D399' : '#A8A29E'}
                />
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
            <View style={tw`pt-2`}>
              <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-3`}>
                Clip window
              </Text>
              <View style={tw`flex-row justify-between mb-1`}>
                <Text style={tw`text-stone-300 text-sm`}>Start {formatMs(trimStartMs)}</Text>
                <Text style={tw`text-stone-300 text-sm`}>
                  End {formatMs(effectiveEnd || durationMs)}
                </Text>
              </View>
              <Slider
                style={tw`w-full h-8 mb-2`}
                minimumValue={0}
                maximumValue={Math.max(durationMs, 1000)}
                value={trimStartMs}
                step={100}
                onValueChange={(v) => {
                  const next = Math.min(v, (effectiveEnd || durationMs) - 500);
                  setTrimStartMs(Math.max(0, next));
                }}
                onSlidingComplete={(v) => void seekTo(v)}
                minimumTrackTintColor="#059669"
                maximumTrackTintColor="#44403C"
                thumbTintColor="#10B981"
              />
              <Slider
                style={tw`w-full h-8 mb-4`}
                minimumValue={0}
                maximumValue={Math.max(durationMs, 1000)}
                value={effectiveEnd || durationMs}
                step={100}
                onValueChange={(v) => {
                  setTrimEndMs(Math.max(v, trimStartMs + 500));
                }}
                onSlidingComplete={(v) => void seekTo(Math.min(v, durationMs))}
                minimumTrackTintColor="#059669"
                maximumTrackTintColor="#44403C"
                thumbTintColor="#10B981"
              />
              <View style={tw`flex-row gap-2`}>
                <Pressable
                  onPress={() => {
                    setTrimStartMs(positionMs);
                    void seekTo(positionMs);
                  }}
                  style={tw`flex-1 py-3 rounded-2xl bg-stone-800 border border-stone-700 items-center`}
                >
                  <Text style={tw`text-white text-xs font-bold`}>Set start here</Text>
                </Pressable>
                <Pressable
                  onPress={() => setTrimEndMs(Math.max(positionMs, trimStartMs + 500))}
                  style={tw`flex-1 py-3 rounded-2xl bg-stone-800 border border-stone-700 items-center`}
                >
                  <Text style={tw`text-white text-xs font-bold`}>Set end here</Text>
                </Pressable>
              </View>
              <Text style={tw`text-stone-500 text-xs mt-3 leading-5`}>
                Trim controls what loops in the preview and when your reel plays in the feed.
              </Text>
            </View>
          )}

          {tab === 'look' && (
            <View style={tw`pt-2`}>
              <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mb-3`}>
                Looks
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
                          tw`w-16 h-20 rounded-2xl overflow-hidden border-2 items-center justify-center`,
                          {
                            backgroundColor: l.wash || '#1C1917',
                            borderColor: selected ? '#34D399' : '#44403C',
                          },
                        ]}
                      >
                        {l.id === 'none' ? (
                          <Ionicons name="sparkles-outline" size={22} color="#A8A29E" />
                        ) : (
                          <View
                            style={[
                              tw`absolute inset-0`,
                              { backgroundColor: l.wash || 'transparent' },
                            ]}
                          />
                        )}
                      </View>
                      <Text
                        style={tw`text-[11px] font-semibold mt-1.5 ${
                          selected ? 'text-brand-300' : 'text-stone-400'
                        }`}
                      >
                        {l.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {tab === 'audio' && (
            <View style={tw`pt-2`}>
              <Pressable
                onPress={() => setMuted((m) => !m)}
                style={tw`flex-row items-center justify-between bg-stone-900 border border-stone-800 rounded-2xl px-4 py-4 mb-5`}
              >
                <View style={tw`flex-row items-center`}>
                  <View style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3`}>
                    <Ionicons
                      name={muted ? 'volume-mute' : 'volume-high'}
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <View>
                    <Text style={tw`text-white font-semibold`}>Sound</Text>
                    <Text style={tw`text-stone-500 text-xs mt-0.5`}>
                      {muted ? 'Muted' : 'Audio on'}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    tw`w-12 h-7 rounded-full px-0.5 justify-center`,
                    muted ? tw`bg-stone-700` : tw`bg-brand-600`,
                  ]}
                >
                  <View
                    style={[
                      tw`w-6 h-6 rounded-full bg-white`,
                      muted ? tw`self-start` : tw`self-end`,
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
                  <View style={tw`flex-row gap-2 mb-3`}>
                    {[
                      { label: 'Top', y: 0.18 },
                      { label: 'Mid', y: 0.42 },
                      { label: 'Low', y: 0.72 },
                    ].map((p) => (
                      <Pressable
                        key={p.label}
                        onPress={() => updateActive({ y: p.y, x: 0.5 })}
                        style={tw`flex-1 py-2.5 rounded-xl bg-stone-900 border border-stone-700 items-center`}
                      >
                        <Text style={tw`text-stone-300 text-xs font-semibold`}>{p.label}</Text>
                      </Pressable>
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
                    Add a short label that sits on your reel frame.
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
