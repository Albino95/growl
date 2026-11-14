import React, { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import tw from '../../lib/tw';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { spring } from '../../theme/motion';
import { progressRatio } from './challengeUtils';

type Props = {
  progress: number;
  target: number;
  height?: number;
  completed?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Soft emerald progress bar that springs into place (static with reduced motion). */
export default function ChallengeProgressBar({ progress, target, height = 6, completed, style }: Props) {
  const ratio = progressRatio(progress, target);
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? ratio : 0)).current;

  useEffect(() => {
    if (reduced) {
      anim.setValue(ratio);
      return;
    }
    // Native-driven scaleX (anchored left) — springs in on mount / join / check-in.
    const a = spring(anim, ratio, 'gentle');
    a.start();
    return () => a.stop();
  }, [anim, ratio, reduced]);

  return (
    <View
      style={[tw`w-full rounded-full bg-emerald-50 overflow-hidden`, { height }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: target, now: Math.min(progress, target) }}
    >
      <Animated.View
        style={[
          // The track's rounded overflow clips the ends, so the fill stays square (no squashed caps).
          { height, width: '100%', transformOrigin: 'left', transform: [{ scaleX: anim }] },
          { backgroundColor: completed ? '#F97066' : '#059669' },
        ]}
      />
    </View>
  );
}
