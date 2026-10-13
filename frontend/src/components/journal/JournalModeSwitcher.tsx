import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

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

  useEffect(() => {
    Animated.spring(slide, {
      toValue: mode === 'pages' ? 0 : 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 7,
    }).start();
  }, [mode, slide]);

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
        tw`flex-row rounded-2xl p-1`,
        {
          backgroundColor: '#EAE4D6',
          borderWidth: 1,
          borderColor: 'rgba(28,25,23,0.06)',
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
            borderRadius: 14,
            backgroundColor: '#FFFcf7',
            borderWidth: 1,
            borderColor: 'rgba(5,150,105,0.35)',
            transform: [{ translateX }],
          }}
        />
      ) : null}

      <PressableScale
        feedback="select"
        onPress={() => onChange('pages')}
        style={tw`flex-1 flex-row items-center justify-center py-2.5 px-2 z-10`}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'pages' }}
      >
        <Ionicons
          name="book-outline"
          size={15}
          color={mode === 'pages' ? '#059669' : '#78716C'}
        />
        <Text
          style={tw`ml-1.5 text-[14px] ${
            mode === 'pages' ? 'font-bold text-stone-900' : 'font-medium text-stone-500'
          }`}
        >
          Pages
        </Text>
        {reflectionsCount > 0 ? (
          <View style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-energy-600 items-center justify-center`}>
            <Text style={tw`text-[10px] font-bold text-white`}>
              {reflectionsCount > 99 ? '99+' : reflectionsCount}
            </Text>
          </View>
        ) : null}
      </PressableScale>

      <PressableScale
        feedback="select"
        onPress={() => onChange('voices')}
        style={tw`flex-1 flex-row items-center justify-center py-2.5 px-2 z-10`}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'voices' }}
      >
        <Ionicons
          name="radio-outline"
          size={15}
          color={mode === 'voices' ? '#059669' : '#78716C'}
        />
        <Text
          style={tw`ml-1.5 text-[14px] ${
            mode === 'voices' ? 'font-bold text-stone-900' : 'font-medium text-stone-500'
          }`}
        >
          Voices
        </Text>
        {voicesCount > 0 ? (
          <View
            style={tw`ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${
              mode === 'voices' ? 'bg-emerald-700' : 'bg-stone-400'
            }`}
          >
            <Text style={tw`text-[10px] font-bold text-white`}>
              {voicesCount > 99 ? '99+' : voicesCount}
            </Text>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );
}
