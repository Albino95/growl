import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Audio } from 'expo-av';
import type { TextOverlay } from '../photoEditor/types';
import type { VideoEditSettings } from './types';
import { normalizeVideoEdit } from './types';
import { getMusicPlaybackUrl } from '../../../constants/postMusic';
import tw from '../../../lib/tw';
import { buildVideoCssFilter } from './videoFilters';
import { VideoGradeStack } from './GradeOverlays';
import NativeClipPlayer from './NativeClipPlayer';

type ContentFit = 'cover' | 'contain';

type Props = {
  uri: string;
  settings?: Partial<VideoEditSettings> | null;
  shouldPlay?: boolean;
  style?: object;
  useNativeControls?: boolean;
  /** cover = fill (Reels). contain = whole frame (preview / thumbs). */
  contentFit?: ContentFit;
  /** Rewind at trim end (reels). Stories pass false and listen to onEnded. */
  loop?: boolean;
  onEnded?: () => void;
  onProgress?: (positionMs: number, durationMs: number) => void;
};

type HtmlVideoEl = {
  play: () => Promise<void>;
  pause: () => void;
  currentTime: number;
  playbackRate: number;
  muted: boolean;
  volume: number;
  duration: number;
};

/** Soundtrack-only player for photo reels (image + music, no video decode). */
export function ReelSoundtrack({
  settings,
  shouldPlay = true,
}: {
  settings?: Partial<VideoEditSettings> | null;
  shouldPlay?: boolean;
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const edit = normalizeVideoEdit(settings);
  const soundtrackUrl = getMusicPlaybackUrl(edit.audioTrackId, edit.audioUrl);

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
      if (!soundtrackUrl || Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (!webAudioRef.current) webAudioRef.current = new window.Audio();
      const el = webAudioRef.current;
      el.loop = true;
      el.volume = Math.max(0, Math.min(1, edit.audioVolume ?? 0.85));
      if (el.src !== soundtrackUrl) {
        el.src = soundtrackUrl;
        el.load?.();
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.removeAttribute?.('src');
        webAudioRef.current = null;
      }
    };
  }, [soundtrackUrl, edit.audioVolume]);

  useEffect(() => {
    if (!shouldPlay || !soundtrackUrl) {
      void soundRef.current?.pauseAsync();
      webAudioRef.current?.pause();
      return;
    }
    void (async () => {
      try {
        if (soundRef.current) {
          await soundRef.current.setPositionAsync(0);
          await soundRef.current.playAsync();
        }
        if (webAudioRef.current) {
          webAudioRef.current.currentTime = 0;
          await webAudioRef.current.play();
        }
      } catch {
        /* ignore */
      }
    })();
  }, [shouldPlay, soundtrackUrl]);

  return null;
}

/** Shared reel video surface — trim, look, flip, volumes, text, soundtrack. */
export default function ReelVideoPlayer({
  uri,
  settings,
  shouldPlay = true,
  style,
  useNativeControls = false,
  contentFit = 'cover',
  loop = true,
  onEnded,
  onProgress,
}: Props) {
  const htmlVideoRef = useRef<HtmlVideoEl | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;
  const edit = normalizeVideoEdit(settings);
  const soundtrackUrl = getMusicPlaybackUrl(edit.audioTrackId, edit.audioUrl);
  const webFilter = Platform.OS === 'web' ? buildVideoCssFilter(edit) : undefined;
  const trimStart = edit.trimStartMs || 0;
  const trimEnd = edit.trimEndMs || 0;
  const originalVol = edit.originalVolume;
  const isMuted = originalVol <= 0.001;

  const onWebTimeUpdate = useCallback(() => {
    const el = htmlVideoRef.current;
    if (!el) return;
    const durationMs = (el.duration || 0) * 1000;
    const positionMs = (el.currentTime || 0) * 1000;
    onProgressRef.current?.(positionMs, durationMs);
    const endSec = trimEnd > 0 ? trimEnd / 1000 : el.duration || 0;
    if (endSec > 0 && el.currentTime >= endSec - 0.08) {
      if (loop) {
        el.currentTime = trimStart / 1000;
        if (webAudioRef.current) webAudioRef.current.currentTime = 0;
        return;
      }
      if (!endedRef.current) {
        endedRef.current = true;
        el.pause();
        onEndedRef.current?.();
      }
    }
  }, [loop, trimEnd, trimStart]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = htmlVideoRef.current;
    if (el) {
      el.muted = isMuted;
      el.volume = isMuted ? 0 : Math.max(0, Math.min(1, originalVol));
    }
  }, [isMuted, originalVol]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (htmlVideoRef.current) htmlVideoRef.current.playbackRate = edit.speed || 1;
  }, [edit.speed]);

  useEffect(() => {
    let cancelled = false;

    const loadNativeSound = async () => {
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {
          /* ignore */
        }
        soundRef.current = null;
      }
      if (!soundtrackUrl || Platform.OS !== 'web') return;
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
        });
        let playbackUrl = soundtrackUrl;
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: playbackUrl },
            {
              shouldPlay: false,
              isLooping: true,
              volume: edit.audioVolume ?? 0.85,
            }
          );
          if (cancelled) {
            await sound.unloadAsync();
            return;
          }
          soundRef.current = sound;
        } catch {
          const fallback = edit.audioUrl?.trim();
          if (fallback && fallback !== playbackUrl) {
            const { sound } = await Audio.Sound.createAsync(
              { uri: fallback },
              {
                shouldPlay: false,
                isLooping: true,
                volume: edit.audioVolume ?? 0.85,
              }
            );
            if (cancelled) {
              await sound.unloadAsync();
              return;
            }
            soundRef.current = sound;
          }
        }
      } catch {
        soundRef.current = null;
      }
    };

    const loadWebSound = () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !soundtrackUrl) return;
      if (!webAudioRef.current) {
        webAudioRef.current = new window.Audio();
      }
      const el = webAudioRef.current;
      el.loop = true;
      el.volume = Math.max(0, Math.min(1, edit.audioVolume ?? 0.85));
      if (el.src !== soundtrackUrl) {
        el.src = soundtrackUrl;
        el.load?.();
      }
    };

    if (Platform.OS === 'web') {
      loadWebSound();
    }

    return () => {
      cancelled = true;
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (webAudioRef.current) {
        webAudioRef.current.pause();
        webAudioRef.current.removeAttribute?.('src');
        webAudioRef.current = null;
      }
    };
  }, [soundtrackUrl, edit.audioVolume, edit.audioUrl, shouldPlay]);

  useEffect(() => {
    endedRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!shouldPlay) {
      htmlVideoRef.current?.pause();
      webAudioRef.current?.pause();
      return;
    }
    endedRef.current = false;
    void (async () => {
      const el = htmlVideoRef.current;
      if (el) {
        el.currentTime = trimStart / 1000;
        try {
          await el.play();
        } catch {
          /* autoplay blocked */
        }
      }
      if (webAudioRef.current && soundtrackUrl) {
        try {
          webAudioRef.current.currentTime = 0;
          await webAudioRef.current.play();
        } catch {
          /* ignore */
        }
      }
    })();
  }, [shouldPlay, trimStart, uri, soundtrackUrl]);

  // Keep soundtrack volume in sync without remounting the audio element
  useEffect(() => {
    const vol = Math.max(0, Math.min(1, edit.audioVolume ?? 0.85));
    if (soundRef.current) {
      void soundRef.current.setVolumeAsync(vol);
    }
    if (webAudioRef.current) {
      webAudioRef.current.volume = vol;
    }
  }, [edit.audioVolume]);

  const flipTransform = [
    { scaleX: edit.flipH ? -1 : 1 },
    { scaleY: edit.flipV ? -1 : 1 },
  ];
  const webFlip =
    [edit.flipH ? 'scaleX(-1)' : '', edit.flipV ? 'scaleY(-1)' : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <View style={[tw`overflow-hidden bg-black`, { width: '100%', height: '100%' }, style]}>
      {Platform.OS === 'web'
        ? React.createElement('video', {
            ref: htmlVideoRef,
            key: uri,
            src: uri,
            muted: isMuted,
            loop: loop && !(trimEnd > 0),
            playsInline: true,
            autoPlay: shouldPlay,
            controls: useNativeControls,
            preload: 'auto',
            className: contentFit === 'contain' ? 'grow-video-contain' : 'grow-video-cover',
            onTimeUpdate: onWebTimeUpdate,
            style: {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: contentFit,
              objectPosition: 'center center',
              backgroundColor: '#000',
              filter: webFilter,
              transform: webFlip,
            },
          })
        : (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { width: '100%', height: '100%', transform: flipTransform },
            ]}
          >
            <NativeClipPlayer
              uri={uri}
              shouldPlay={shouldPlay}
              loop={loop}
              muted={isMuted}
              volume={isMuted ? 0 : originalVol}
              playbackRate={edit.speed || 1}
              contentFit={contentFit}
              useNativeControls={useNativeControls}
              onEnded={onEnded}
              onProgress={onProgress}
            />
          </View>
        )}
      <VideoGradeStack edit={edit} />
      {(edit.overlays as TextOverlay[]).map((o) =>
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
                fontSize: o.style === 'bold' ? 20 : 17,
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
    </View>
  );
}
