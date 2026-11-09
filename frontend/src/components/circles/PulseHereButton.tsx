import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import EqualizerBars from '../ui/EqualizerBars';
import { feedback } from '../../utils/interactionFeedback';

type Props = {
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
};

/** “I’m here” with a ring that blooms on tap — presence, not a meeting button. */
export default function PulseHereButton({ onPress, busy, disabled }: Props) {
  const ring = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ring, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [ring]);

  const fire = () => {
    feedback.tap();
    burst.setValue(0);
    Animated.timing(burst, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    onPress();
  };

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={tw`flex-1`}>
      <Animated.View
        pointerEvents="none"
        style={[
          tw`absolute inset-0 rounded-2xl bg-emerald-500`,
          { transform: [{ scale: ringScale }], opacity: ringOpacity },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          tw`absolute inset-0 rounded-2xl bg-emerald-400`,
          { transform: [{ scale: burstScale }], opacity: burstOpacity },
        ]}
      />
      <PressableScale
        onPress={fire}
        disabled={busy || disabled}
        feedback={false}
        style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center flex-row justify-center ${
          busy ? 'opacity-70' : ''
        }`}
      >
        <EqualizerBars active={!busy} color="#ECFDF5" barCount={4} />
        <Text style={tw`text-white font-bold ml-2`}>{busy ? 'Pulsing…' : 'I’m here'}</Text>
      </PressableScale>
    </View>
  );
}
