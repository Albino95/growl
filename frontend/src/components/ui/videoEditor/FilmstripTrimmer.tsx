import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  PanResponder,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import tw from '../../../lib/tw';
import { frameCountForDuration, frameImageSource, type FrameThumb } from './extractFrames';
import {
  HANDLE_W,
  MIN_TRIM_MS,
  clampPlayheadMs,
  filmstripWindow,
  handlePositions,
  playheadClampedToTrim,
  snapToFrame,
  tapFrameAdjustsTrim,
} from './filmstripMath';

const STRIP_H = 84;
/** Screen-reader nudge size for IN / OUT / playhead (swipe up / down). */
const A11Y_STEP_MS = 500;

type A11yActionEvent = { nativeEvent: { actionName: string } };

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
  frames?: FrameThumb[];
  onChangeTrim: (startMs: number, endMs: number) => void;
  onSeek: (ms: number) => void;
};

/**
 * Full-clip filmstrip: IN and OUT handles stay on screen, cells fill the width,
 * tap a cell to seek, drag the playhead to scrub.
 */
export default function FilmstripTrimmer({
  durationMs,
  trimStartMs,
  trimEndMs,
  positionMs,
  frames: framesProp,
  onChangeTrim,
  onSeek,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const [stripW, setStripW] = useState(Math.max(220, winW - 48));

  const { duration, start, end } = filmstripWindow(durationMs, trimStartMs, trimEndMs);
  const frames = framesProp && framesProp.length > 0 ? framesProp : [];

  const trimRef = useRef({ start, end });
  trimRef.current = { start, end };
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const onChangeTrimRef = useRef(onChangeTrim);
  const onSeekRef = useRef(onSeek);
  onChangeTrimRef.current = onChangeTrim;
  onSeekRef.current = onSeek;
  const dragOrigin = useRef({ start: 0, end: 0, play: 0 });
  const positionRef = useRef(positionMs);
  positionRef.current = positionMs;

  const frameCount = Math.max(frames.length, frameCountForDuration(duration));
  const contentW = Math.max(1, stripW);
  const cellW = contentW / frameCount;
  const contentWRef = useRef(contentW);
  contentWRef.current = contentW;

  const msToX = (ms: number) => (contentW > 0 ? (ms / duration) * contentW : 0);

  const makeHandlePan = (mode: 'start' | 'end' | 'play') =>
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
          play: positionRef.current,
        };
        if (mode === 'start') onSeekRef.current(trimRef.current.start);
        else if (mode === 'end') onSeekRef.current(trimRef.current.end);
      },
      onPanResponderMove: (_evt, gesture) => {
        const w = contentWRef.current;
        const d = durationRef.current;
        if (!w) return;
        const deltaMs = (gesture.dx / w) * d;
        const snap = (ms: number) => snapToFrame(ms, framesRef.current, d);

        if (mode === 'play') {
          const raw = dragOrigin.current.play + deltaMs;
          const clamped = playheadClampedToTrim()
            ? Math.max(dragOrigin.current.start, Math.min(dragOrigin.current.end, raw))
            : clampPlayheadMs(raw, d);
          onSeekRef.current(snap(clamped));
          return;
        }

        if (mode === 'start') {
          const nextStart = snap(
            Math.max(0, Math.min(dragOrigin.current.start + deltaMs, dragOrigin.current.end - MIN_TRIM_MS))
          );
          onChangeTrimRef.current(nextStart, dragOrigin.current.end);
          onSeekRef.current(nextStart);
          return;
        }
        if (mode === 'end') {
          const nextEnd = snap(
            Math.min(d, Math.max(dragOrigin.current.end + deltaMs, dragOrigin.current.start + MIN_TRIM_MS))
          );
          onChangeTrimRef.current(dragOrigin.current.start, nextEnd);
          onSeekRef.current(nextEnd);
        }
      },
      onPanResponderRelease: () => undefined,
      onPanResponderTerminate: () => undefined,
    });

  const startPan = useRef(makeHandlePan('start')).current;
  const endPan = useRef(makeHandlePan('end')).current;
  const playPan = useRef(makeHandlePan('play')).current;

  const { startX, endX, startLeft, endLeft } = handlePositions(
    start,
    end,
    duration,
    contentW,
    HANDLE_W
  );
  const playX = msToX(
    playheadClampedToTrim() ? Math.max(start, Math.min(end, positionMs)) : clampPlayheadMs(positionMs, duration)
  );
  const selWidth = Math.max(HANDLE_W * 2, endX - startX);
  const activeIndex = useMemo(() => {
    if (!frames.length) return 0;
    let best = 0;
    let bestD = Infinity;
    frames.forEach((f, i) => {
      const d = Math.abs(f.timeMs - positionMs);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }, [frames, positionMs]);

  const nudgeHandle = (mode: 'start' | 'end' | 'play', dir: 1 | -1) => {
    const delta = dir * A11Y_STEP_MS;
    if (mode === 'start') {
      const next = Math.max(0, Math.min(start + delta, end - MIN_TRIM_MS));
      onChangeTrim(next, end);
      onSeek(next);
      return;
    }
    if (mode === 'end') {
      const next = Math.min(duration, Math.max(end + delta, start + MIN_TRIM_MS));
      onChangeTrim(start, next);
      onSeek(next);
      return;
    }
    const raw = positionMs + delta;
    onSeek(
      playheadClampedToTrim() ? Math.max(start, Math.min(end, raw)) : clampPlayheadMs(raw, duration)
    );
  };

  const handleA11y = (mode: 'start' | 'end' | 'play', label: string, valueMs: number) => ({
    accessible: true,
    accessibilityRole: 'adjustable' as const,
    accessibilityLabel: label,
    accessibilityValue: {
      min: 0,
      max: Math.round(duration / 1000),
      now: Math.round(valueMs / 1000),
      text: formatMs(valueMs),
    },
    accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
    onAccessibilityAction: (e: A11yActionEvent) => {
      if (e.nativeEvent.actionName === 'increment') nudgeHandle(mode, 1);
      else if (e.nativeEvent.actionName === 'decrement') nudgeHandle(mode, -1);
    },
  });

  const onTapFrame = (frame: FrameThumb) => {
    const t = frame.timeMs;
    if (tapFrameAdjustsTrim()) {
      if (t < start) {
        onChangeTrim(t, end);
        onSeek(t);
        return;
      }
      if (t > end) {
        onChangeTrim(start, t);
        onSeek(t);
        return;
      }
    }
    onSeek(t);
  };

  return (
    <View style={tw`w-full`} collapsable={false}>
      <View style={tw`flex-row justify-between mb-2`}>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(start)}</Text>
        <Text style={tw`text-stone-400 text-xs`}>
          {formatMs(Math.max(0, end - start))} · frame {activeIndex + 1}/{frameCount}
        </Text>
        <Text style={tw`text-white text-xs font-bold`}>{formatMs(end)}</Text>
      </View>

      <View
        collapsable={false}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 40 && Math.abs(w - stripW) > 2) setStripW(w);
        }}
        style={[
          tw`rounded-xl bg-stone-900 border border-stone-600`,
          { height: STRIP_H, overflow: 'hidden', width: '100%' },
        ]}
      >
        <View style={{ width: contentW, height: STRIP_H }} collapsable={false}>
          <View style={[tw`flex-row absolute inset-0`, { height: STRIP_H }]}>
            {Array.from({ length: frameCount }, (_, i) => {
              const f = frames[i];
              const t = f?.timeMs ?? (i / Math.max(1, frameCount - 1)) * duration;
              const selected = t >= start && t <= end;
              const src = frameImageSource(f);
              if (!f || !src) {
                const sec = Math.floor(t / 1000);
                return (
                  <Pressable
                    key={`ph-${i}`}
                    onPress={() => onTapFrame(f || { uri: '', timeMs: t })}
                    accessibilityRole="button"
                    accessibilityLabel={`Seek to ${formatMs(t)}`}
                    style={{
                      width: cellW,
                      height: STRIP_H,
                      backgroundColor: i % 2 === 0 ? '#44403C' : '#292524',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: selected ? 1 : 0.45,
                    }}
                  >
                    <Text style={tw`text-stone-500 text-[11px] font-semibold`}>{sec}s</Text>
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={`${f.timeMs}-${i}`}
                  onPress={() => onTapFrame(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Seek to ${formatMs(t)}`}
                  style={{ width: cellW, height: STRIP_H }}
                >
                  <Image
                    source={src as { uri: string }}
                    style={{
                      width: cellW,
                      height: STRIP_H,
                      opacity: selected ? 1 : 0.38,
                    }}
                    contentFit="cover"
                  />
                  {i === activeIndex ? (
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFillObject,
                        { borderWidth: 1.5, borderColor: '#FBBF24' },
                      ]}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View pointerEvents="none" style={[styles.dim, { left: 0, width: Math.max(0, startX) }]} />
          <View
            pointerEvents="none"
            style={[styles.dim, { left: endX, width: Math.max(0, contentW - endX) }]}
          />

          <View
            pointerEvents="none"
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

          <View
            collapsable={false}
            {...startPan.panHandlers}
            {...handleA11y('start', 'Trim start', start)}
            style={[
              styles.handle,
              { left: startLeft },
            ]}
          >
            <Text style={styles.handleLabel}>IN</Text>
            <View style={styles.handleBar} />
          </View>

          <View
            collapsable={false}
            {...endPan.panHandlers}
            {...handleA11y('end', 'Trim end', end)}
            style={[
              styles.handle,
              { left: endLeft },
            ]}
          >
            <View style={styles.handleBar} />
            <Text style={styles.handleLabel}>OUT</Text>
          </View>

          <View
            collapsable={false}
            {...playPan.panHandlers}
            {...handleA11y('play', 'Playhead', positionMs)}
            style={[
              styles.playheadHit,
              { left: Math.max(0, Math.min(contentW - 22, playX - 11)) },
            ]}
          >
            <View style={styles.playhead} />
          </View>
        </View>
      </View>

      <Text style={tw`text-stone-500 text-[11px] mt-2 text-center`}>
        White IN / OUT trim the clip · Yellow playhead scrubs · Gray is outside the cut
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
    zIndex: 20,
    elevation: 20,
  },
  handleLabel: {
    color: '#111827',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  handleBar: {
    width: 3,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#111827',
    marginVertical: 3,
  },
  playheadHit: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    width: 22,
    zIndex: 24,
    elevation: 24,
    alignItems: 'center',
  },
  playhead: {
    width: 3,
    flex: 1,
    backgroundColor: '#FBBF24',
    borderRadius: 2,
  },
});
