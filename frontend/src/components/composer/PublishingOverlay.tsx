import React, { useEffect, useRef } from 'react';
import { Animated, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GrowLoader from '../ui/GrowLoader';
import { COMPOSER_COPY } from '../../hooks/composerConfig';
import type { PublishPhase } from '../../hooks/composerMachine';
import tw from '../../lib/tw';
import { duration, easing, pop, timing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * The "Shared" check: pops in (bouncy) with one soft ring blooming out behind it.
 * The success haptic is fired once by useMediaComposer, not here.
 * Reduce Motion → the check simply appears.
 */
function SuccessMark() {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(reduced ? 1 : 0.5)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      scale.setValue(1);
      return;
    }
    const anim = Animated.parallel([
      pop(scale, 1.14, 'bouncy'),
      timing(ring, 1, { duration: duration.slow, easing: easing.out }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduced, ring, scale]);

  return (
    <View style={tw`w-16 h-16 items-center justify-center mb-4`}>
      {!reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[
            tw`absolute w-16 h-16 rounded-full bg-brand-500`,
            {
              opacity: ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          tw`w-16 h-16 rounded-full bg-brand-600 items-center justify-center`,
          { transform: [{ scale }] },
        ]}
      >
        <Ionicons name="checkmark" size={32} color="#fff" />
      </Animated.View>
    </View>
  );
}

type Props =
  | { variant: 'loading'; label: string }
  | { variant: 'publishing'; phase: PublishPhase | null }
  | {
      variant: 'success';
      title?: string;
      body?: string;
      /** Extra buttons (Reel: View in Reels / Done). */
      actions?: React.ReactNode;
    };

/**
 * The one loading / publishing / success layer for create flows.
 * `loading` and `publishing` sit over the media stage; `success` covers the screen.
 */
export default function PublishingOverlay(props: Props) {
  if (props.variant === 'success') {
    return (
      <View
        style={tw`absolute inset-0 z-50 bg-brand-900/95 items-center justify-center px-8`}
        accessibilityLiveRegion="assertive"
      >
        <SuccessMark />
        <Text style={tw`text-white text-2xl font-bold mb-2`} accessibilityRole="header">
          {props.title || COMPOSER_COPY.success}
        </Text>
        {props.body ? (
          <Text style={tw`text-white/70 text-center mb-8`}>{props.body}</Text>
        ) : null}
        {props.actions}
      </View>
    );
  }
  const label =
    props.variant === 'publishing'
      ? COMPOSER_COPY.phase[props.phase || 'preparing']
      : props.label;
  return (
    <View
      style={tw`absolute inset-0 bg-black/55 items-center justify-center z-30`}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
    >
      <GrowLoader label={label} />
    </View>
  );
}
