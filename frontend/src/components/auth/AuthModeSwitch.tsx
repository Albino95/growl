import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import { triggerFeedback } from '../../utils/interactionFeedback';

type Props = {
  isSignUp: boolean;
  onChange: (isSignUp: boolean) => void;
  reducedMotion?: boolean;
  disabled?: boolean;
};

const PADDING = 4; // p-1
const BORDER = 1; // border

/**
 * Sign in / Sign up segmented control with a sliding pill.
 * The pill width is measured on layout; movement is a native-driver spring.
 */
export default function AuthModeSwitch({ isSignUp, onChange, reducedMotion, disabled }: Props) {
  const [segmentWidth, setSegmentWidth] = useState(0);
  const position = useRef(new Animated.Value(isSignUp ? 1 : 0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const target = isSignUp ? 1 : 0;
    if (reducedMotion) {
      // Crossfade the pill to its new spot instead of sliding.
      const anim = Animated.sequence([
        Animated.timing(pillOpacity, { toValue: 0, duration: 60, useNativeDriver: true }),
        Animated.timing(position, { toValue: target, duration: 0, useNativeDriver: true }),
        Animated.timing(pillOpacity, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]);
      anim.start();
      return () => anim.stop();
    }
    pillOpacity.setValue(1);
    const anim = Animated.spring(position, {
      toValue: target,
      damping: 20,
      stiffness: 260,
      mass: 1,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [isSignUp, reducedMotion, position, pillOpacity]);

  const onLayout = (e: LayoutChangeEvent) => {
    const inner = e.nativeEvent.layout.width - BORDER * 2 - PADDING * 2;
    const next = Math.max(0, inner / 2);
    if (Math.abs(next - segmentWidth) > 0.5) setSegmentWidth(next);
  };

  const select = (next: boolean) => {
    if (disabled || next === isSignUp) return;
    triggerFeedback('select');
    onChange(next);
  };

  const segment = (value: boolean, label: string) => {
    const active = value === isSignUp;
    return (
      <Pressable
        onPress={() => select(value)}
        disabled={disabled}
        style={tw`flex-1 py-2.5 items-center justify-center min-h-[44px]`}
        accessibilityRole="tab"
        accessibilityState={{ selected: active, disabled: !!disabled }}
        accessibilityLabel={label}
      >
        <Text style={tw`font-semibold ${active ? 'text-emerald-700' : 'text-ink-3'}`}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="tablist"
      style={tw`flex-row mb-5 bg-raised/80 p-1 rounded-card border border-line/60`}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            tw`absolute rounded-control bg-card`,
            {
              top: PADDING,
              bottom: PADDING,
              left: PADDING,
              width: segmentWidth,
              opacity: pillOpacity,
              shadowColor: theme.colors.ink,
              shadowOpacity: 0.06,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: 1,
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, segmentWidth],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {segment(false, 'Sign in')}
      {segment(true, 'Sign up')}
    </View>
  );
}
