import React, { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import tw from '../../lib/tw';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { progressRatio } from './challengeUtils';

type Props = {
  progress: number;
  target: number;
  height?: number;
  completed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Soft emerald progress bar that grows into place (static with reduced motion). */
export default function ChallengeProgressBar({ progress, target, height = 6, completed, style }: Props) {
  const ratio = progressRatio(progress, target);
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? ratio : 0)).current;

  useEffect(() => {
    if (reduced) {
      anim.setValue(ratio);
      return;
    }
    const a = Animated.timing(anim, { toValue: ratio, duration: 520, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [anim, ratio, reduced]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={[tw`w-full rounded-full bg-emerald-50 overflow-hidden`, { height }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: Math.min(progress, target) }}
    >
      <Animated.View
        style={[
          { height, width, borderRadius: height / 2 },
          { backgroundColor: completed ? '#F97066' : '#059669' },
        ]}
      />
    </View>
  );
}
