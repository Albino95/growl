import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import tw from '../../lib/tw';
import { breathe, pop } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { stageAccent, stageEmoji, stageLabel } from './seedMeta';

type Props = {
  stage: string;
  progress: number;
  size?: number;
  shared?: boolean;
  resting?: boolean;
  /** Bump to pulse when watered / staged up */
  pulseKey?: number;
};

/** Animated seed → tree visual with coral energy ring + soft glow. */
export default function SeedPlantVisual({
  stage,
  progress,
  size = 88,
  shared = false,
  resting = false,
  pulseKey = 0,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const accent = stageAccent(stage);
  const pct = Math.max(0, Math.min(1, progress));

  const reduced = useReducedMotion();

  useEffect(() => {
    // Ambient bob / sway / glow — held still under Reduce Motion.
    bob.setValue(0);
    sway.setValue(0);
    glow.setValue(0.5);
    const loops = [
      breathe(bob, 0, -4, { period: 3200 }, reduced),
      breathe(sway, -1, 1, { period: 4400 }, reduced),
      breathe(glow, 0.3, 0.7, { period: 3600 }, reduced),
    ];
    loops.forEach((l) => l?.start());
    return () => loops.forEach((l) => l?.stop());
  }, [bob, sway, glow, reduced]);

  useEffect(() => {
    if (!pulseKey) return;
    scale.stopAnimation();
    const pulse = pop(scale, 1.16, 'bouncy', reduced);
    pulse.start();
    return () => pulse.stop();
  }, [pulseKey, scale, reduced]);

  const ringSize = size + 18;
  const rotate = sway.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-3deg', '3deg'],
  });

  return (
    <View style={{ width: ringSize, height: ringSize + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: ringSize + 10,
          height: ringSize + 10,
          borderRadius: (ringSize + 10) / 2,
          backgroundColor: accent.ring,
          opacity: resting ? 0.08 : glow.interpolate({
            inputRange: [0.3, 0.7],
            outputRange: [0.08, 0.18],
          }),
          transform: [{ scale }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 3,
          borderColor: 'rgba(28,25,23,0.08)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 3,
          borderColor: pct > 0.05 ? '#F97066' : accent.ring,
          opacity: 0.2 + pct * 0.8,
          transform: [{ rotate: `${-90 + pct * 280}deg` }],
          borderTopColor: '#F97066',
          borderRightColor: pct > 0.28 ? '#F97066' : 'transparent',
          borderBottomColor: pct > 0.55 ? accent.ring : 'transparent',
          borderLeftColor: 'transparent',
        }}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: resting ? '#E7E5E4' : accent.wash,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: resting ? 0.7 : 1,
            transform: [{ scale }, { translateY: bob }, { rotate }],
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.7)',
          },
        ]}
      >
        <Text style={{ fontSize: size * 0.4 }}>{stageEmoji(stage)}</Text>
        {shared ? (
          <View
            style={tw`absolute -bottom-1 px-1.5 py-0.5 rounded-full bg-emerald-600 border border-white`}
          >
            <Text style={tw`text-[8px] font-bold text-white`}>Shared</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        style={[
          tw`absolute -bottom-5 text-[10px] font-semibold`,
          { color: resting ? '#A8A29E' : '#57534E' },
        ]}
      >
        {resting ? 'Resting' : stageLabel(stage)}
      </Text>
    </View>
  );
}
