import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  triggerKey: number;
};

const SPECKS = [
  { dx: -28, dy: -36, delay: 0, color: '#059669' },
  { dx: 30, dy: -32, delay: 30, color: '#F97066' },
  { dx: -36, dy: 10, delay: 50, color: '#34D399' },
  { dx: 34, dy: 14, delay: 40, color: '#F97066' },
  { dx: 0, dy: -44, delay: 20, color: '#047857' },
];

/** Tiny seed-and-smile burst — on-brand easter egg, not a heart catalog. */
export default function SeedSmileBurst({ triggerKey }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const reduceMotion = useReducedMotion();
  const specks = useMemo(
    () =>
      SPECKS.map(() => ({
        o: new Animated.Value(0),
        x: new Animated.Value(0),
        y: new Animated.Value(0),
      })),
    []
  );

  useEffect(() => {
    if (!triggerKey) return;
    opacity.setValue(0);
    scale.setValue(0.4);
    specks.forEach((s) => {
      s.o.setValue(0);
      s.x.setValue(0);
      s.y.setValue(0);
    });
    if (reduceMotion) {
      // Smile fades in and out in place; no pop, no flying specks.
      scale.setValue(1);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(420),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 10 }),
          Animated.timing(opacity, { toValue: 1, duration: 90, useNativeDriver: true }),
        ]),
        Animated.delay(420),
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]),
      ...specks.map((s, i) =>
        Animated.sequence([
          Animated.delay(SPECKS[i].delay),
          Animated.parallel([
            Animated.timing(s.o, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(s.x, { toValue: SPECKS[i].dx, duration: 420, useNativeDriver: true }),
            Animated.timing(s.y, { toValue: SPECKS[i].dy, duration: 420, useNativeDriver: true }),
          ]),
          Animated.timing(s.o, { toValue: 0, duration: 180, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [triggerKey, opacity, reduceMotion, scale, specks]);

  if (!triggerKey) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View style={styles.center}>
        <Animated.Text style={[styles.face, { opacity, transform: [{ scale }] }]}>◡</Animated.Text>
        {specks.map((s, i) => (
          <Animated.View
            key={i}
            style={[
              styles.speck,
              {
                backgroundColor: SPECKS[i].color,
                opacity: s.o,
                transform: [{ translateX: s.x }, { translateY: s.y }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  face: { fontSize: 28, color: '#065F46', fontWeight: '700' },
  speck: {
    position: 'absolute',
    width: 7,
    height: 9,
    borderRadius: 6,
  },
});
