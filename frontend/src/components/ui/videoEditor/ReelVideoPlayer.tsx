import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Video, AVPlaybackStatus, ResizeMode } from 'expo-av';
import type { TextOverlay } from '../photoEditor/types';
import type { VideoEditSettings } from './types';
import { DEFAULT_VIDEO_EDIT, getVideoLook } from './types';
import tw from '../../../lib/tw';

type Props = {
  uri: string;
  settings?: Partial<VideoEditSettings> | null;
  shouldPlay?: boolean;
  style?: object;
  useNativeControls?: boolean;
};

/** Shared reel video surface — applies mute, speed, trim loop, look, and text. */
export default function ReelVideoPlayer({
  uri,
  settings,
  shouldPlay = true,
  style,
  useNativeControls = false,
}: Props) {
  const videoRef = useRef<Video>(null);
  const edit: VideoEditSettings = {
    ...DEFAULT_VIDEO_EDIT,
    ...settings,
    overlays: settings?.overlays || [],
  };
  const look = getVideoLook(edit.lookId);
  const trimStart = edit.trimStartMs || 0;
  const trimEnd = edit.trimEndMs || 0;

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      const end = trimEnd > 0 ? trimEnd : status.durationMillis || 0;
      if (end > 0 && (status.positionMillis || 0) >= end - 80) {
        void videoRef.current?.setPositionAsync(trimStart);
      }
    },
    [trimEnd, trimStart]
  );

  useEffect(() => {
    void videoRef.current?.setIsMutedAsync(edit.muted);
  }, [edit.muted]);

  useEffect(() => {
    void videoRef.current?.setRateAsync(edit.speed || 1, true);
  }, [edit.speed]);

  useEffect(() => {
    if (!shouldPlay) {
      void videoRef.current?.pauseAsync();
      return;
    }
    void (async () => {
      await videoRef.current?.setPositionAsync(trimStart);
      await videoRef.current?.playAsync();
    })();
  }, [shouldPlay, trimStart, uri]);

  const webFilter =
    Platform.OS === 'web'
      ? look.grayscale
        ? 'grayscale(1) contrast(1.15)'
        : edit.lookId === 'pop'
          ? 'saturate(1.35) contrast(1.1)'
          : edit.lookId === 'fade'
            ? 'contrast(0.92) brightness(1.06)'
            : edit.lookId === 'cine'
              ? 'contrast(1.12) saturate(0.9) brightness(0.95)'
              : undefined
      : undefined;

  return (
    <View style={[tw`overflow-hidden bg-black`, style]}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={[StyleSheet.absoluteFillObject, webFilter ? ({ filter: webFilter } as object) : null]}
        resizeMode={ResizeMode.COVER}
        shouldPlay={shouldPlay}
        isLooping={false}
        isMuted={edit.muted}
        onPlaybackStatusUpdate={onStatus}
        useNativeControls={useNativeControls}
      />
      {look.wash ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: look.wash }]}
        />
      ) : null}
      {look.cinematic ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <View style={tw`absolute top-0 left-0 right-0 h-14 bg-black/45`} />
          <View style={tw`absolute bottom-0 left-0 right-0 h-16 bg-black/50`} />
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
