import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';
import { easing, loopPeriod } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  label?: string;
  /** Dark overlays (camera / composer). */
  light?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Brand loader — a seed that swells and smiles. Not a spinner, not a leaf.
 * Hold it for a quiet line.
 */
export default function GrowLoader({ label, light = false, size = 'md' }: Props) {
  const pulse = useRef(new Animated.Value(0.86)).current;
  const smile = useRef(new Animated.Value(0.35)).current;
  const speck = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState('');
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      // Still, smiling seed — the label carries the "loading" meaning.
      pulse.setValue(1);
      smile.setValue(1);
      speck.setValue(0);
      return;
    }
    const half = loopPeriod / 2;
    const to = (v: Animated.Value, toValue: number, ease = true) =>
      Animated.timing(v, {
        toValue,
        duration: half,
        ...(ease ? { easing: easing.inOut } : {}),
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([to(pulse, 1.08), to(smile, 1), to(speck, 1, false)]),
        Animated.parallel([to(pulse, 0.86), to(smile, 0.4), to(speck, 0.15, false)]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, smile, speck]);

  const dim = size === 'lg' ? 72 : size === 'sm' ? 36 : 56;
  const face = size === 'lg' ? 28 : size === 'sm' ? 14 : 22;
  const ink = light ? '#065F46' : '#ECFDF5';
  const seed = light ? '#059669' : '#10B981';

  return (
    <View style={styles.wrap}>
      <Pressable
        onLongPress={() => {
          feedback.egg();
          setHint('Patience is a garden.');
          setTimeout(() => setHint(''), 1600);
        }}
        delayLongPress={420}
        hitSlop={12}
        accessibilityLabel={label || 'Growing'}
      >
        <View style={{ width: dim + 18, height: dim + 18, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View
            style={[
              styles.speck,
              {
                backgroundColor: '#F97066',
                opacity: speck,
                transform: [
                  {
                    translateY: speck.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, -dim * 0.42],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.seed,
              {
                width: dim,
                height: dim,
                borderRadius: dim / 2,
                backgroundColor: seed,
                transform: [{ scale: pulse }],
              },
            ]}
          >
            <Animated.Text style={[styles.face, { fontSize: face, color: ink, opacity: smile }]}>
              ◡
            </Animated.Text>
          </Animated.View>
        </View>
      </Pressable>
      {label ? (
        <Text style={[styles.label, { color: light ? theme.colors.ink2 : '#FFFFFF' }]}>{label}</Text>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, { color: light ? theme.colors.leafInk : '#A7F3D0' }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  seed: { alignItems: 'center', justifyContent: 'center' },
  face: { fontWeight: '700', marginTop: -2 },
  speck: {
    position: 'absolute',
    width: 7,
    height: 9,
    borderRadius: 6,
  },
  label: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
});
