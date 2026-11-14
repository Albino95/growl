import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { duration, easing, spring, timing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
  const reduced = useReducedMotion();
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

    if (reduced) {
      // Reduce Motion: a still heart that fades in and out — no travel, no particles.
      scale.setValue(1);
      Animated.sequence([
        timing(opacity, 1, {}, true),
        Animated.delay(360),
        timing(opacity, 0, {}, true),
      ]).start();
      return;
    }

    const particleSeq = particleAnims.map((p, i) => {
      const spec = PARTICLES[i];
      return Animated.sequence([
        Animated.delay(spec.delay),
        Animated.parallel([
          timing(p.opacity, 1, { duration: duration.instant }),
          spring(p.scale, 1, 'bouncy'),
          timing(p.x, spec.dx, { duration: duration.slow, easing: easing.out }),
          timing(p.y, spec.dy, { duration: duration.slow, easing: easing.out }),
        ]),
        timing(p.opacity, 0, { duration: duration.base }),
      ]);
    });

    Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          spring(scale, 1, 'bouncy'),
          timing(opacity, 1, { duration: duration.instant }),
        ]),
        Animated.delay(280),
        Animated.parallel([
          timing(opacity, 0, { duration: duration.gentle, easing: easing.in }),
          timing(scale, 1.35, { duration: duration.gentle, easing: easing.in }),
        ]),
      ]),
      ...particleSeq,
    ]).start();
  }, [triggerKey, opacity, scale, particleAnims, reduced]);

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
