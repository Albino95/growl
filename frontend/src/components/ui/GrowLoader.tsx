import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { feedback } from '../../utils/interactionFeedback';

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

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 1.08,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(smile, {
            toValue: 1,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(speck, {
            toValue: 1,
            duration: 780,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 0.86,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(smile, {
            toValue: 0.4,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(speck, {
            toValue: 0.15,
            duration: 780,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, smile, speck]);

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
        <Text style={[styles.label, { color: light ? '#44403C' : '#FFFFFF' }]}>{label}</Text>
      ) : null}
      {hint ? (
        <Text style={[styles.hint, { color: light ? '#059669' : '#A7F3D0' }]}>{hint}</Text>
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
