import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Video, Audio, AVPlaybackStatus, ResizeMode } from 'expo-av';
import type { TextOverlay } from '../photoEditor/types';
import type { VideoEditSettings } from './types';
import { getVideoLook, normalizeVideoEdit } from './types';
import { getMusicPlaybackUrl } from '../../../constants/postMusic';
import tw from '../../../lib/tw';
import {
  buildVideoCssFilter,
  videoVignetteStrength,
  videoCinematicStrength,
  videoFadeOpacity,
} from './videoFilters';

type Props = {
  uri: string;
  settings?: Partial<VideoEditSettings> | null;
  shouldPlay?: boolean;
  style?: object;
  useNativeControls?: boolean;
};

/** Shared reel video surface — trim, look, flip, volumes, text, soundtrack. */
export default function ReelVideoPlayer({
  uri,
  settings,
  shouldPlay = true,
  style,
  useNativeControls = false,
}: Props) {
  const videoRef = useRef<Video>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const edit = normalizeVideoEdit(settings);
  const look = getVideoLook(edit.lookId);
  const soundtrackUrl = getMusicPlaybackUrl(edit.audioTrackId, edit.audioUrl);
  const webFilter = Platform.OS === 'web' ? buildVideoCssFilter(edit) : undefined;
  const vignetteStrength = videoVignetteStrength(edit);
  const cinematicStrength = videoCinematicStrength(edit);
  const fadeOverlay = videoFadeOpacity(edit);
  const trimStart = edit.trimStartMs || 0;
  const trimEnd = edit.trimEndMs || 0;
  const originalVol = edit.originalVolume;
  const isMuted = originalVol <= 0.001;

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      const end = trimEnd > 0 ? trimEnd : status.durationMillis || 0;
      if (end > 0 && (status.positionMillis || 0) >= end - 80) {
        void videoRef.current?.setPositionAsync(trimStart);
        if (soundRef.current) {
          void soundRef.current.setPositionAsync(0);
        }
      }
    },
    [trimEnd, trimStart]
  );

  useEffect(() => {
    void videoRef.current?.setIsMutedAsync(isMuted);
    if (!isMuted) {
      void videoRef.current?.setVolumeAsync(Math.max(0, Math.min(1, originalVol)));
    }
  }, [isMuted, originalVol]);

  useEffect(() => {
    void videoRef.current?.setRateAsync(edit.speed || 1, true);
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
      if (!soundtrackUrl || Platform.OS === 'web') return;
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
    } else {
      void loadNativeSound();
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
  }, [soundtrackUrl, edit.audioVolume, edit.audioUrl]);

  useEffect(() => {
    if (!shouldPlay) {
      void videoRef.current?.pauseAsync();
      void soundRef.current?.pauseAsync();
      webAudioRef.current?.pause();
      return;
    }
    void (async () => {
      await videoRef.current?.setPositionAsync(trimStart);
      await videoRef.current?.playAsync();
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
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

  return (
    <View style={[tw`overflow-hidden bg-black`, { width: '100%', height: '100%' }, style]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={[
          StyleSheet.absoluteFillObject,
          { width: '100%', height: '100%', transform: flipTransform },
          // Web <video> ignores ResizeMode.COVER unless object-fit is set.
          Platform.OS === 'web' ? ({ objectFit: 'cover' } as object) : null,
          webFilter ? ({ filter: webFilter } as object) : null,
        ]}
        resizeMode={ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isLooping={false}
        isMuted={isMuted}
        volume={isMuted ? 0 : originalVol}
        onPlaybackStatusUpdate={onStatus}
        useNativeControls={useNativeControls}
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
      {(vignetteStrength > 0) ? (
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
      {(cinematicStrength > 0) ? (
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
