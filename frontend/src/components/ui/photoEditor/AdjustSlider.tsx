import React, { useEffect, useRef, useState, createElement } from 'react';
import { View, Text, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import tw from '../../../lib/tw';
import { snapSliderValue } from './filterEngine';

export function AdjustSlider({
  label,
  value,
  min,
  max,
  onChange,
  onSlidingStart,
  onSlidingComplete,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onSlidingStart?: () => void;
  onSlidingComplete?: () => void;
}) {
  const safeValue = Number.isFinite(value) ? snapSliderValue(value) : 0;
  const [live, setLive] = useState(safeValue);
  const sliding = useRef(false);

  useEffect(() => {
    if (!sliding.current) setLive(safeValue);
  }, [safeValue]);

  const commit = (raw: number) => {
    const snapped = snapSliderValue(Number.isFinite(raw) ? raw : 0);
    setLive(snapped);
    if (snapped !== safeValue) onChange(snapped);
  };

  const step = Math.max(1, Math.round((max - min) / 20));
  const nudge = (dir: 1 | -1) => {
    onSlidingStart?.();
    commit(Math.max(min, Math.min(max, live + dir * step)));
    onSlidingComplete?.();
  };
  // Screen readers get one adjustable control (swipe up/down) instead of the
  // raw slider; web keeps the native range input, which is already accessible.
  const a11y =
    Platform.OS === 'web'
      ? {}
      : {
          accessible: true,
          accessibilityRole: 'adjustable' as const,
          accessibilityLabel: label,
          accessibilityValue: { min, max, now: live },
          accessibilityActions: [{ name: 'increment' }, { name: 'decrement' }],
          onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
            if (e.nativeEvent.actionName === 'increment') nudge(1);
            else if (e.nativeEvent.actionName === 'decrement') nudge(-1);
          },
        };

  return (
    <View style={tw`mb-4`} {...a11y}>
      <View style={tw`flex-row justify-between mb-1`}>
        <Text style={tw`text-stone-300 text-sm font-medium`}>{label}</Text>
        <Text style={tw`text-stone-400 text-sm`}>{live}</Text>
      </View>
      {Platform.OS === 'web' ? (
        createElement('input', {
          type: 'range',
          min,
          max,
          step: 1,
          value: live,
          'aria-label': label,
          onMouseDown: () => {
            sliding.current = true;
            onSlidingStart?.();
          },
          onTouchStart: () => {
            sliding.current = true;
            onSlidingStart?.();
          },
          onChange: (e: { target: { value: string } }) => commit(Number(e.target.value)),
          onMouseUp: () => {
            sliding.current = false;
            onSlidingComplete?.();
          },
          onTouchEnd: () => {
            sliding.current = false;
            onSlidingComplete?.();
          },
          style: {
            width: '100%',
            height: 32,
            accentColor: '#10B981',
            cursor: 'pointer',
          },
        })
      ) : (
        <Slider
          style={tw`w-full h-8`}
          minimumValue={min}
          maximumValue={max}
          value={live}
          onSlidingStart={() => {
            sliding.current = true;
            onSlidingStart?.();
          }}
          onValueChange={commit}
          onSlidingComplete={(raw) => {
            commit(raw);
            sliding.current = false;
            onSlidingComplete?.();
          }}
          minimumTrackTintColor="#059669"
          maximumTrackTintColor="#44403C"
          thumbTintColor="#10B981"
          step={1}
        />
      )}
    </View>
  );
}
