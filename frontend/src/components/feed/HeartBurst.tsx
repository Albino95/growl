import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  /** Remount / change to replay the burst */
  triggerKey: number;
  size?: number;
};

const PARTICLES = [
  { dx: -42, dy: -58, delay: 0, size: 0.42, color: '#F87171' },
  { dx: 48, dy: -52, delay: 40, size: 0.38, color: '#FB7185' },
  { dx: -56, dy: 8, delay: 70, size: 0.34, color: '#EF4444' },
  { dx: 58, dy: 14, delay: 55, size: 0.36, color: '#F43F5E' },
  { dx: -18, dy: 48, delay: 90, size: 0.3, color: '#FDA4AF' },
  { dx: 22, dy: 52, delay: 110, size: 0.32, color: '#FCA5A5' },
];

/** Instagram-style floating heart + particle burst on double-tap / like. */
export default function HeartBurst({ triggerKey, size = 96 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.2)).current;
  const particleAnims = useMemo(
    () =>
      PARTICLES.map(() => ({
        opacity: new Animated.Value(0),
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        scale: new Animated.Value(0.4),
      })),
    []
  );

  useEffect(() => {
    if (!triggerKey) return;
    opacity.setValue(0);
    scale.setValue(0.2);
    particleAnims.forEach((p) => {
      p.opacity.setValue(0);
      p.x.setValue(0);
      p.y.setValue(0);
      p.scale.setValue(0.4);
    });

    const particleSeq = particleAnims.map((p, i) => {
      const spec = PARTICLES[i];
      return Animated.sequence([
        Animated.delay(spec.delay),
        Animated.parallel([
          Animated.timing(p.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.spring(p.scale, {
            toValue: 1,
            friction: 5,
            tension: 180,
            useNativeDriver: true,
          }),
          Animated.timing(p.x, { toValue: spec.dx, duration: 520, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: spec.dy, duration: 520, useNativeDriver: true }),
        ]),
        Animated.timing(p.opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]);
    });

    Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale, {
            toValue: 1,
            friction: 4,
            tension: 160,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(280),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.35,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
      ]),
      ...particleSeq,
    ]).start();
  }, [triggerKey, opacity, scale, particleAnims]);

  if (!triggerKey) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={styles.center}>
        <Animated.View style={{ opacity, transform: [{ scale }] }}>
          <Ionicons name="heart" size={size} color="#FFFFFF" style={styles.shadow} />
        </Animated.View>
        {particleAnims.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                opacity: p.opacity,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { scale: p.scale },
                ],
              },
            ]}
          >
            <Ionicons
              name="heart"
              size={Math.round(size * PARTICLES[i].size)}
              color={PARTICLES[i].color}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  shadow: {
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
});
