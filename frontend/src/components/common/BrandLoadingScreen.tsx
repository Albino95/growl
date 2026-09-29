import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import tw, { theme } from '../../lib/tw';

export type BrandLoadingVariant = 'splash' | 'page' | 'dark';

type Props = {
  /** Optional status line under the mark */
  message?: string;
  /** splash = emerald field (cold start); page = cream; dark = reels */
  variant?: BrandLoadingVariant;
  /** Show Grow! wordmark above the mark */
  showWordmark?: boolean;
  /** When false, leave StatusBar alone (nested in screens with their own bar) */
  manageStatusBar?: boolean;
};

const PALETTE = {
  splash: {
    bg: '#049669',
    soft: 'rgba(255,255,255,0.12)',
    ring: 'rgba(243,238,228,0.45)',
    ringSoft: 'rgba(243,238,228,0.22)',
    orb: 'rgba(249,112,102,0.35)',
    wordmark: 'rgba(243,238,228,0.92)',
    message: 'rgba(243,238,228,0.78)',
    dot: '#F3EEE4',
    status: 'light' as const,
  },
  page: {
    bg: theme.colors.page,
    soft: theme.colors.brandSoft,
    ring: 'rgba(5,150,105,0.28)',
    ringSoft: 'rgba(5,150,105,0.14)',
    orb: 'rgba(249,112,102,0.18)',
    wordmark: theme.colors.brand,
    message: theme.colors.textMuted,
    dot: theme.colors.brand,
    status: 'dark' as const,
  },
  dark: {
    bg: '#0A0A0A',
    soft: 'rgba(5,150,105,0.18)',
    ring: 'rgba(16,185,129,0.45)',
    ringSoft: 'rgba(16,185,129,0.2)',
    orb: 'rgba(249,112,102,0.28)',
    wordmark: '#ECFDF5',
    message: 'rgba(255,255,255,0.55)',
    dot: '#34D399',
    status: 'light' as const,
  },
};

/**
 * Modern full-screen Grow! loader — pulsing mark, orbit rings, soft orbs, staggered dots.
 * Uses RN Animated only (no reanimated / lottie).
 */
export default function BrandLoadingScreen({
  message,
  variant = 'page',
  showWordmark = true,
  manageStatusBar = true,
}: Props) {
  const palette = PALETTE[variant];
  const pulse = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;
  const floatA = useRef(new Animated.Value(0)).current;
  const floatB = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const ringLoop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 4800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const ringBLoop = Animated.loop(
      Animated.timing(ringB, {
        toValue: 1,
        duration: 7200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const floatALoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatA, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatA, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const floatBLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatB, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatB, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const bounceDot = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(420),
        ])
      );

    const d0 = bounceDot(dot0, 0);
    const d1 = bounceDot(dot1, 140);
    const d2 = bounceDot(dot2, 280);

    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    pulseLoop.start();
    ringLoop.start();
    ringBLoop.start();
    floatALoop.start();
    floatBLoop.start();
    d0.start();
    d1.start();
    d2.start();

    return () => {
      pulseLoop.stop();
      ringLoop.stop();
      ringBLoop.stop();
      floatALoop.stop();
      floatBLoop.stop();
      d0.stop();
      d1.stop();
      d2.stop();
    };
  }, [pulse, ring, ringB, floatA, floatB, enter, dot0, dot1, dot2]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.05] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const rotate = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = ringB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const orbAY = floatA.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const orbBX = floatB.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const contentY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const markSize = variant === 'splash' ? 112 : 96;
  const ringSize = markSize + 36;

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]} accessibilityRole="progressbar">
      {manageStatusBar ? <StatusBar style={palette.status} /> : null}

      {/* Ambient field */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.wash, { backgroundColor: palette.soft }]} />
        <Animated.View
          style={[
            styles.orb,
            {
              top: '12%',
              right: '-8%',
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: palette.orb,
              transform: [{ translateY: orbAY }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orb,
            {
              bottom: '16%',
              left: '-10%',
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: palette.soft,
              opacity: 0.85,
              transform: [{ translateX: orbBX }],
            },
          ]}
        />
      </View>

      <Animated.View
        style={[
          styles.content,
          {
            opacity: enter,
            transform: [{ translateY: contentY }],
          },
        ]}
      >
        {showWordmark ? (
          <Text style={[styles.wordmark, { color: palette.wordmark }]}>Grow!</Text>
        ) : null}

        <View style={[styles.markStage, { width: ringSize + 24, height: ringSize + 24 }]}>
          <Animated.View
            style={[
              styles.glow,
              {
                width: markSize + 28,
                height: markSize + 28,
                borderRadius: (markSize + 28) / 2,
                backgroundColor: variant === 'splash' ? 'rgba(243,238,228,0.18)' : 'rgba(5,150,105,0.12)',
                opacity: glow,
                transform: [{ scale }],
              },
            ]}
          />

          <Animated.View
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                borderColor: palette.ring,
                transform: [{ rotate }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ringInner,
              {
                width: ringSize - 18,
                height: ringSize - 18,
                borderRadius: (ringSize - 18) / 2,
                borderColor: palette.ringSoft,
                transform: [{ rotate: rotateB }],
              },
            ]}
          />

          <Animated.View style={{ transform: [{ scale }] }}>
            <Image
              source={require('../../../assets/icon.png')}
              style={{
                width: markSize,
                height: markSize,
                borderRadius: variant === 'splash' ? markSize * 0.22 : 22,
              }}
              accessibilityLabel="Grow!"
            />
          </Animated.View>
        </View>

        {message ? (
          <Text style={[styles.message, { color: palette.message }]}>{message}</Text>
        ) : null}

        <View style={styles.dots}>
          {[dot0, dot1, dot2].map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: palette.dot,
                  opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                  transform: [
                    {
                      translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }),
                    },
                  ],
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  orb: {
    position: 'absolute',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  markStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  glow: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  ringInner: {
    position: 'absolute',
    borderWidth: 1,
  },
  message: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: 280,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});

/** @deprecated Prefer BrandLoadingScreen — kept as thin alias for existing imports */
export function FullScreenBrandLoader(props: Props) {
  return <BrandLoadingScreen {...props} />;
}
