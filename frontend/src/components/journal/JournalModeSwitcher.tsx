import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import { radius } from '../../theme/tokens';
import PressableScale from '../ui/PressableScale';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type JournalMode = 'pages' | 'voices';

type Props = {
  mode: JournalMode;
  onChange: (mode: JournalMode) => void;
  voicesCount?: number;
  reflectionsCount?: number;
};

/**
 * Compact segmented control — Pages (write) vs Voices (listen).
 * Sliding pill + distinct select feedback; avoids the heavy dual-card that ate the viewport.
 */
export default function JournalModeSwitcher({
  mode,
  onChange,
  voicesCount = 0,
  reflectionsCount = 0,
}: Props) {
  const slide = useRef(new Animated.Value(mode === 'pages' ? 0 : 1)).current;
  const [trackW, setTrackW] = useState(0);
  const c = useThemeColors();
  const scheme = useColorSchemeName();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      // Jump the pill instead of sliding it.
      slide.setValue(mode === 'pages' ? 0 : 1);
      return;
    }
    Animated.spring(slide, {
      toValue: mode === 'pages' ? 0 : 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 7,
    }).start();
  }, [mode, reduceMotion, slide]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const pillWidth = trackW > 0 ? (trackW - 8) / 2 : 0;
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, pillWidth)],
  });

  return (
    <View
      onLayout={onTrackLayout}
      style={[
        tw`flex-row rounded-card p-1`,
        {
          backgroundColor: c.raised,
          borderWidth: 1,
          borderColor: scheme === 'dark' ? c.line : 'rgba(28,25,23,0.06)',
        },
      ]}
      accessibilityRole="tablist"
    >
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 4,
            left: 4,
            width: pillWidth,
            bottom: 4,
            borderRadius: radius.control,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: 'rgba(5,150,105,0.35)',
            transform: [{ translateX }],
          }}
        />
      ) : null}

      <PressableScale
        // Chip tone only when the mode actually changes; re-press = tick.
        feedback={mode === 'pages' ? 'selection' : 'chip'}
        onPress={() => onChange('pages')}
        style={tw`flex-1 flex-row items-center justify-center py-2.5 px-2 z-10`}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'pages' }}
      >
        <Ionicons
          name="book-outline"
          size={15}
          color={mode === 'pages' ? c.brand : c.ink3}
        />
        <Text
          style={tw`ml-1.5 text-body ${
            mode === 'pages' ? 'font-bold text-ink' : 'font-medium text-ink-3'
          }`}
        >
          Pages
        </Text>
        {reflectionsCount > 0 ? (
          <View style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-energy-600 items-center justify-center`}>
            <Text maxFontSizeMultiplier={1.3} style={tw`text-caption font-bold text-white`}>
              {reflectionsCount > 99 ? '99+' : reflectionsCount}
            </Text>
          </View>
        ) : null}
      </PressableScale>

      <PressableScale
        feedback={mode === 'voices' ? 'selection' : 'chip'}
        onPress={() => onChange('voices')}
        style={tw`flex-1 flex-row items-center justify-center py-2.5 px-2 z-10`}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'voices' }}
      >
        <Ionicons
          name="radio-outline"
          size={15}
          color={mode === 'voices' ? c.brand : c.ink3}
        />
        <Text
          style={tw`ml-1.5 text-body ${
            mode === 'voices' ? 'font-bold text-ink' : 'font-medium text-ink-3'
          }`}
        >
          Voices
        </Text>
        {voicesCount > 0 ? (
          <View
            style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${
              mode === 'voices' ? 'bg-emerald-600' : 'bg-stone-400'
            }`}
          >
            <Text maxFontSizeMultiplier={1.3} style={tw`text-caption font-bold text-white`}>
              {voicesCount > 99 ? '99+' : voicesCount}
            </Text>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );
}
