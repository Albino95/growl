import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  PanResponder,
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
} from 'react-native';
import tw from '../../../lib/tw';
import { extractVideoFrames, type FrameThumb } from './extractFrames';

const STRIP_H = 64;
const HANDLE_W = 14;
const MIN_TRIM_MS = 500;

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  videoUri: string;
  durationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  positionMs: number;
  onChangeTrim: (startMs: number, endMs: number) => void;
  onSeek: (ms: number) => void;
};

/**
 * Instagram-style trimmer: filmstrip of frames + draggable selection window.
 */
export default function FilmstripTrimmer({
  videoUri,
  durationMs,
  trimStartMs,
  trimEndMs,
  positionMs,
  onChangeTrim,
  onSeek,
}: Props) {
  const [width, setWidth] = useState(0);
  const [frames, setFrames] = useState<FrameThumb[]>([]);
  const [loading, setLoading] = useState(true);
  const duration = Math.max(durationMs, 1);
  const end = trimEndMs > 0 ? trimEndMs : duration;

  const trimRef = useRef({ start: trimStartMs, end });
  trimRef.current = { start: trimStartMs, end };
  const widthRef = useRef(0);
  widthRef.current = width;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const dragOrigin = useRef({ start: 0, end: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const count = width > 0 ? Math.max(6, Math.min(12, Math.round(width / 42))) : 10;
    void extractVideoFrames(videoUri, durationMs || 5000, count).then((next) => {
      if (cancelled) return;
      setFrames(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [videoUri, durationMs, width]);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const msToX = (ms: number) => (ms / duration) * width;

  const startX = msToX(trimStartMs);
  const endX = msToX(end);
  const playX = msToX(Math.max(trimStartMs, Math.min(end, positionMs)));

  const leftHandle = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragOrigin.current = { ...trimRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current;
          const d = durationRef.current;
          if (!w) return;
          const deltaMs = (g.dx / w) * d;
          const nextStart = Math.max(
            0,
            Math.min(dragOrigin.current.start + deltaMs, dragOrigin.current.end - MIN_TRIM_MS)
          );
          onChangeTrim(nextStart, dragOrigin.current.end);
          onSeek(nextStart);
        },
      }),
    [onChangeTrim, onSeek]
  );

  const rightHandle = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragOrigin.current = { ...trimRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current;
          const d = durationRef.current;
          if (!w) return;
          const deltaMs = (g.dx / w) * d;
          const nextEnd = Math.min(
            d,
            Math.max(dragOrigin.current.end + deltaMs, dragOrigin.current.start + MIN_TRIM_MS)
          );
          onChangeTrim(dragOrigin.current.start, nextEnd);
          onSeek(nextEnd);
        },
      }),
    [onChangeTrim, onSeek]
  );

  const windowDrag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragOrigin.current = { ...trimRef.current };
        },
        onPanResponderMove: (_e, g) => {
          const w = widthRef.current;
          const d = durationRef.current;
          if (!w) return;
          const deltaMs = (g.dx / w) * d;
          const span = dragOrigin.current.end - dragOrigin.current.start;
          let nextStart = dragOrigin.current.start + deltaMs;
          let nextEnd = dragOrigin.current.end + deltaMs;
          if (nextStart < 0) {
            nextStart = 0;
            nextEnd = span;
          }
          if (nextEnd > d) {
            nextEnd = d;
            nextStart = d - span;
          }
          onChangeTrim(nextStart, nextEnd);
        },
        onPanResponderRelease: () => {
          onSeek(trimRef.current.start);
        },
      }),
    [onChangeTrim, onSeek]
  );

  return (
    <View style={tw`w-full`}>
      <View style={tw`flex-row justify-between mb-2`}>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(trimStartMs)}</Text>
        <Text style={tw`text-stone-400 text-xs`}>
          {formatMs(Math.max(0, end - trimStartMs))} selected
        </Text>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(end)}</Text>
      </View>

      <View
        onLayout={onLayout}
        style={[
          tw`rounded-xl overflow-hidden bg-stone-900 border border-stone-700`,
          { height: STRIP_H },
        ]}
      >
        {width > 0 && (
          <View style={[tw`flex-row absolute inset-0`, { height: STRIP_H }]}>
            {loading && frames.length === 0 ? (
              <View style={tw`flex-1 items-center justify-center`}>
                <ActivityIndicator color="#A8A29E" />
              </View>
            ) : frames.length > 0 ? (
              frames.map((f, i) => (
                <Image
                  key={`${f.timeMs}-${i}`}
                  source={{ uri: f.uri }}
                  style={{
                    width: width / frames.length,
                    height: STRIP_H,
                  }}
                  resizeMode="cover"
                />
              ))
            ) : (
              Array.from({ length: 10 }).map((_, i) => (
                <View
                  key={`ph-${i}`}
                  style={{
                    width: width / 10,
                    height: STRIP_H,
                    backgroundColor: i % 2 === 0 ? '#292524' : '#1C1917',
                  }}
                />
              ))
            )}
          </View>
        )}

        {/* Dim outside selection */}
        {width > 0 && (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                { left: 0, width: Math.max(0, startX) },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.dim,
                { left: endX, width: Math.max(0, width - endX) },
              ]}
            />

            {/* Selection window */}
            <View
              {...windowDrag.panHandlers}
              style={[
                styles.window,
                {
                  left: startX,
                  width: Math.max(HANDLE_W * 2, endX - startX),
                },
              ]}
            >
              <View style={styles.windowBorder} />
            </View>

            {/* Left handle */}
            <View
              {...leftHandle.panHandlers}
              style={[styles.handle, { left: Math.max(0, startX - HANDLE_W / 2) }]}
              hitSlop={{ left: 8, right: 8, top: 4, bottom: 4 }}
            >
              <View style={styles.handleBar} />
            </View>

            {/* Right handle */}
            <View
              {...rightHandle.panHandlers}
              style={[styles.handle, { left: Math.min(width - HANDLE_W, endX - HANDLE_W / 2) }]}
              hitSlop={{ left: 8, right: 8, top: 4, bottom: 4 }}
            >
              <View style={styles.handleBar} />
            </View>

            {/* Playhead */}
            <View
              pointerEvents="none"
              style={[styles.playhead, { left: Math.max(0, Math.min(width - 2, playX)) }]}
            />
          </>
        )}
      </View>

      <Text style={tw`text-stone-500 text-[11px] mt-2 text-center`}>
        Drag handles to trim · Drag the window to move the clip
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  window: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  windowBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 4,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  handleBar: {
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  playhead: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: '#FBBF24',
    zIndex: 6,
  },
});
