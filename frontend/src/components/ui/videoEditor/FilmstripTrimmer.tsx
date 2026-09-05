import React, { useEffect, useRef, useState } from 'react';
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

const STRIP_H = 76;
const HANDLE_W = 22;
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
 * Instagram-style filmstrip trimmer.
 * Start / end / window each own a PanResponder so parent ScrollViews can't steal the gesture.
 * Drag math uses gesture.dx (stable) instead of locationX (flaky on web).
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

  const duration = Math.max(durationMs, 1000);
  const end = trimEndMs > 0 ? Math.min(trimEndMs, duration) : duration;
  const start = Math.max(0, Math.min(trimStartMs, end - MIN_TRIM_MS));

  const trimRef = useRef({ start, end });
  trimRef.current = { start, end };
  const widthRef = useRef(0);
  widthRef.current = width;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const onChangeTrimRef = useRef(onChangeTrim);
  const onSeekRef = useRef(onSeek);
  onChangeTrimRef.current = onChangeTrim;
  onSeekRef.current = onSeek;
  const dragOrigin = useRef({ start: 0, end: 0 });

  useEffect(() => {
    let cancelled = false;
    if (!videoUri || width <= 0) return;

    setLoading(true);
    const count = Math.max(8, Math.min(12, Math.round(width / 36)));
    void extractVideoFrames(videoUri, Math.max(durationMs, 1000), count).then((next) => {
      if (cancelled) return;
      setFrames(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [videoUri, width, durationMs]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - width) > 1) setWidth(w);
  };

  const msToX = (ms: number) => (width > 0 ? (ms / duration) * width : 0);

  const makeHandlePan = (mode: 'start' | 'end' | 'window') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        dragOrigin.current = {
          start: trimRef.current.start,
          end: trimRef.current.end,
        };
        if (mode === 'start') onSeekRef.current(trimRef.current.start);
        else if (mode === 'end') onSeekRef.current(trimRef.current.end);
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = widthRef.current;
        const d = durationRef.current;
        if (!w) return;
        const deltaMs = (gesture.dx / w) * d;

        if (mode === 'start') {
          const nextStart = Math.max(
            0,
            Math.min(dragOrigin.current.start + deltaMs, dragOrigin.current.end - MIN_TRIM_MS)
          );
          onChangeTrimRef.current(nextStart, dragOrigin.current.end);
          onSeekRef.current(nextStart);
          return;
        }
        if (mode === 'end') {
          const nextEnd = Math.min(
            d,
            Math.max(dragOrigin.current.end + deltaMs, dragOrigin.current.start + MIN_TRIM_MS)
          );
          onChangeTrimRef.current(dragOrigin.current.start, nextEnd);
          onSeekRef.current(nextEnd);
          return;
        }

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
        onChangeTrimRef.current(nextStart, nextEnd);
      },
    });

  const startPan = useRef(makeHandlePan('start')).current;
  const endPan = useRef(makeHandlePan('end')).current;
  const windowPan = useRef(makeHandlePan('window')).current;

  const startX = msToX(start);
  const endX = msToX(end);
  const playX = msToX(Math.max(start, Math.min(end, positionMs)));
  const selWidth = Math.max(HANDLE_W * 2, endX - startX);
  const frameCount = frames.length || 8;

  return (
    <View style={tw`w-full`} collapsable={false}>
      <View style={tw`flex-row justify-between mb-2`}>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(start)}</Text>
        <Text style={tw`text-stone-400 text-xs`}>{formatMs(Math.max(0, end - start))} selected</Text>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(end)}</Text>
      </View>

      <View
        onLayout={onLayout}
        collapsable={false}
        style={[
          tw`rounded-xl bg-stone-900 border border-stone-600`,
          { height: STRIP_H, overflow: 'hidden' },
        ]}
      >
        {width <= 0 ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color="#A8A29E" />
          </View>
        ) : (
          <>
            <View style={[tw`flex-row absolute inset-0`, { height: STRIP_H }]} pointerEvents="none">
              {loading && frames.length === 0 ? (
                <View style={tw`flex-1 items-center justify-center`}>
                  <ActivityIndicator color="#A8A29E" />
                  <Text style={tw`text-stone-500 text-[10px] mt-1`}>Loading frames…</Text>
                </View>
              ) : (
                Array.from({ length: frameCount }, (_, i) => {
                  const f = frames[i];
                  const cellW = width / frameCount;
                  if (!f || f.placeholder || !f.uri) {
                    const sec = Math.floor(
                      ((i / Math.max(1, frameCount - 1)) * duration) / 1000
                    );
                    return (
                      <View
                        key={`ph-${i}`}
                        style={{
                          width: cellW,
                          height: STRIP_H,
                          backgroundColor: i % 2 === 0 ? '#44403C' : '#292524',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={tw`text-stone-500 text-[9px] font-semibold`}>{sec}s</Text>
                      </View>
                    );
                  }
                  return (
                    <Image
                      key={`${f.timeMs}-${i}`}
                      source={{ uri: f.uri }}
                      style={{ width: cellW, height: STRIP_H }}
                      resizeMode="cover"
                    />
                  );
                })
              )}
            </View>

            <View pointerEvents="none" style={[styles.dim, { left: 0, width: Math.max(0, startX) }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: endX, width: Math.max(0, width - endX) }]}
            />

            {/* Middle window — drag to slide clip */}
            <View
              collapsable={false}
              {...windowPan.panHandlers}
              style={[
                styles.windowHit,
                {
                  left: startX + HANDLE_W * 0.5,
                  width: Math.max(24, selWidth - HANDLE_W),
                },
              ]}
            >
              <View pointerEvents="none" style={styles.windowBorder} />
            </View>

            {/* Start handle */}
            <View
              collapsable={false}
              {...startPan.panHandlers}
              style={[
                styles.handle,
                { left: Math.max(0, startX - HANDLE_W / 2) },
              ]}
            >
              <View style={styles.handleBar} />
            </View>

            {/* End handle */}
            <View
              collapsable={false}
              {...endPan.panHandlers}
              style={[
                styles.handle,
                { left: Math.min(width - HANDLE_W, endX - HANDLE_W / 2) },
              ]}
            >
              <View style={styles.handleBar} />
            </View>

            <View
              pointerEvents="none"
              style={[styles.playhead, { left: Math.max(0, Math.min(width - 2, playX)) }]}
            />
          </>
        )}
      </View>

      <Text style={tw`text-stone-500 text-[11px] mt-2 text-center`}>
        Drag white handles to trim · Drag the middle to move the window
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
  windowHit: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 3,
  },
  windowBorder: {
    flex: 1,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    borderRadius: 6,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: HANDLE_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
    elevation: 8,
  },
  handleBar: {
    width: 3,
    height: 28,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  playhead: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    backgroundColor: '#FBBF24',
    zIndex: 9,
  },
});
