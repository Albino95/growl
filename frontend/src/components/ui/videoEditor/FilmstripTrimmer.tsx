import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  PanResponder,
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  GestureResponderEvent,
} from 'react-native';
import tw from '../../../lib/tw';
import { extractVideoFrames, type FrameThumb } from './extractFrames';

const STRIP_H = 72;
const HANDLE_W = 18;
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

type DragMode = 'start' | 'end' | 'window' | null;

/**
 * Instagram-style trimmer: filmstrip of frames + draggable selection window.
 * Uses a single PanResponder (capture) so ScrollView parents don't steal gestures.
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
  const dragMode = useRef<DragMode>(null);
  const dragOrigin = useRef({ start: 0, end: 0, x0: 0 });
  const onChangeTrimRef = useRef(onChangeTrim);
  const onSeekRef = useRef(onSeek);
  onChangeTrimRef.current = onChangeTrim;
  onSeekRef.current = onSeek;

  useEffect(() => {
    let cancelled = false;
    if (!videoUri || width <= 0) return;

    setLoading(true);
    const count = Math.max(7, Math.min(11, Math.round(width / 40)));
    // Don't block forever on duration — extractor reads media duration itself.
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

  const msToX = useCallback((ms: number) => (ms / durationRef.current) * widthRef.current, []);
  const xToMs = useCallback((x: number) => {
    const w = widthRef.current;
    const d = durationRef.current;
    if (!w) return 0;
    return Math.max(0, Math.min(d, (x / w) * d));
  }, []);

  const hitTest = (x: number): DragMode => {
    const s = msToX(trimRef.current.start);
    const e = msToX(trimRef.current.end);
    if (Math.abs(x - s) <= HANDLE_W + 6) return 'start';
    if (Math.abs(x - e) <= HANDLE_W + 6) return 'end';
    if (x >= s && x <= e) return 'window';
    return null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const x = evt.nativeEvent.locationX;
        const mode = hitTest(x) || 'window';
        dragMode.current = mode;
        dragOrigin.current = {
          start: trimRef.current.start,
          end: trimRef.current.end,
          x0: x,
        };
        if (mode === 'start') onSeekRef.current(trimRef.current.start);
        else if (mode === 'end') onSeekRef.current(trimRef.current.end);
        else onSeekRef.current(xToMs(x));
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const w = widthRef.current;
        const d = durationRef.current;
        if (!w || !dragMode.current) return;
        const x = evt.nativeEvent.locationX;
        const deltaMs = ((x - dragOrigin.current.x0) / w) * d;

        if (dragMode.current === 'start') {
          const nextStart = Math.max(
            0,
            Math.min(dragOrigin.current.start + deltaMs, dragOrigin.current.end - MIN_TRIM_MS)
          );
          onChangeTrimRef.current(nextStart, dragOrigin.current.end);
          onSeekRef.current(nextStart);
          return;
        }
        if (dragMode.current === 'end') {
          const nextEnd = Math.min(
            d,
            Math.max(dragOrigin.current.end + deltaMs, dragOrigin.current.start + MIN_TRIM_MS)
          );
          onChangeTrimRef.current(dragOrigin.current.start, nextEnd);
          onSeekRef.current(nextEnd);
          return;
        }
        // window
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
      onPanResponderRelease: () => {
        dragMode.current = null;
      },
      onPanResponderTerminate: () => {
        dragMode.current = null;
      },
    })
  ).current;

  const startX = width > 0 ? msToX(start) : 0;
  const endX = width > 0 ? msToX(end) : 0;
  const playX = width > 0 ? msToX(Math.max(start, Math.min(end, positionMs))) : 0;
  const selWidth = Math.max(HANDLE_W * 2, endX - startX);

  return (
    <View style={tw`w-full`} collapsable={false}>
      <View style={tw`flex-row justify-between mb-2`}>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(start)}</Text>
        <Text style={tw`text-stone-400 text-xs`}>
          {formatMs(Math.max(0, end - start))} selected
        </Text>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(end)}</Text>
      </View>

      <View
        onLayout={onLayout}
        collapsable={false}
        {...pan.panHandlers}
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
                (frames.length ? frames : Array.from({ length: 8 }, () => null)).map(
                  (f, i) => {
                    const cellW = width / (frames.length || 8);
                    if (!f) {
                      return (
                        <View
                          key={`ph-${i}`}
                          style={{
                            width: cellW,
                            height: STRIP_H,
                            backgroundColor: i % 2 === 0 ? '#44403C' : '#292524',
                          }}
                        />
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
                  }
                )
              )}
            </View>

            {/* Dim outside selection */}
            <View pointerEvents="none" style={[styles.dim, { left: 0, width: Math.max(0, startX) }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: endX, width: Math.max(0, width - endX) }]}
            />

            {/* Selection window */}
            <View
              pointerEvents="none"
              style={[styles.window, { left: startX, width: selWidth }]}
            >
              <View style={styles.windowBorder} />
            </View>

            {/* Handles */}
            <View
              pointerEvents="none"
              style={[styles.handle, { left: Math.max(0, startX - HANDLE_W / 2) }]}
            >
              <View style={styles.handleBar} />
            </View>
            <View
              pointerEvents="none"
              style={[
                styles.handle,
                { left: Math.min(width - HANDLE_W, endX - HANDLE_W / 2) },
              ]}
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
        Drag white handles to trim · Drag the middle to move
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
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  handleBar: {
    width: 3,
    height: 26,
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
