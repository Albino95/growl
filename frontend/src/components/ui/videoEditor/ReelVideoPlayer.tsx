import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Video, Audio, AVPlaybackStatus, ResizeMode } from 'expo-av';
import type { TextOverlay } from '../photoEditor/types';
import type { VideoEditSettings } from './types';
import { getVideoLook, normalizeVideoEdit } from './types';
import { getMusicPlaybackUrl } from '../../../constants/postMusic';
import tw from '../../../lib/tw';

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
  const edit = normalizeVideoEdit(settings);
  const look = getVideoLook(edit.lookId);
  const soundtrackUrl = getMusicPlaybackUrl(edit.audioTrackId, edit.audioUrl);
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
    const loadSound = async () => {
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {
          /* ignore */
        }
        soundRef.current = null;
      }
      if (!soundtrackUrl) return;
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: soundtrackUrl },
          {
            shouldPlay,
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
        soundRef.current = null;
      }
    };
    void loadSound();
    return () => {
      cancelled = true;
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, [soundtrackUrl, edit.audioVolume, shouldPlay]);

  useEffect(() => {
    if (!shouldPlay) {
      void videoRef.current?.pauseAsync();
      void soundRef.current?.pauseAsync();
      return;
    }
    void (async () => {
      await videoRef.current?.setPositionAsync(trimStart);
      await videoRef.current?.playAsync();
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      }
    })();
  }, [shouldPlay, trimStart, uri]);

  const webFilter = Platform.OS === 'web' ? look.cssFilter : undefined;
  const flipTransform = [
    { scaleX: edit.flipH ? -1 : 1 },
    { scaleY: edit.flipV ? -1 : 1 },
  ];

  return (
    <View style={[tw`overflow-hidden bg-black`, style]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={[
          StyleSheet.absoluteFillObject,
          { transform: flipTransform },
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
