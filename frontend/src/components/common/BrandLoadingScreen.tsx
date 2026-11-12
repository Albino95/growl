import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../../lib/tw';

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
  /** Fired when the loader layout is ready (hide native splash after paint). */
  onLayout?: () => void;
  /**
   * Cold-start only: parent says the session is hydrated.
   * Intro still plays to the end; then we fade out.
   */
  ready?: boolean;
  /** After grow + smile (+ ready) and the exit fade. */
  onFinished?: () => void;
  /**
   * Cold-start only: colour of the screen underneath (e.g. the cream auth page).
   * When set, the exit cross-fades the background into this colour while the
   * mark fades, instead of fading the whole emerald field over the next screen.
   */
  exitBackground?: string;
};

const PALETTE = {
  splash: {
    bg: '#049669',
    seed: '#ECFDF5',
    smile: '#065F46',
    speck: '#F97066',
    wordmark: 'rgba(243,238,228,0.96)',
    message: 'rgba(243,238,228,0.82)',
    stem: 'rgba(243,238,228,0.35)',
    status: 'light' as const,
  },
  page: {
    bg: theme.colors.page,
    seed: '#059669',
    smile: '#ECFDF5',
    speck: '#F97066',
    wordmark: theme.colors.brand,
    message: theme.colors.textMuted,
    stem: 'rgba(5,150,105,0.22)',
    status: 'dark' as const,
  },
  dark: {
    bg: '#0A0A0A',
    seed: '#10B981',
    smile: '#ECFDF5',
    speck: '#F97066',
    wordmark: '#ECFDF5',
    message: 'rgba(255,255,255,0.55)',
    stem: 'rgba(16,185,129,0.28)',
    status: 'light' as const,
  },
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Grow + smile + hold. Breath loops after that until `ready`. */
const INTRO_MS = 680 + 360 + 420;
const EXIT_MS = 340;
const SAFETY_MS = 5200;

/**
 * Cold-start / gate loader — a seed that swells and smiles.
 * Not a spinner, not orbit rings, not a leaf.
 * Pass `ready` + `onFinished` on app open so Home waits for the intro.
 */
export default function BrandLoadingScreen({
  message,
  variant = 'page',
  showWordmark = true,
  manageStatusBar = true,
  onLayout,
  ready = true,
  onFinished,
  exitBackground,
}: Props) {
  const palette = PALETTE[variant];
  const grow = useRef(new Animated.Value(0)).current;
  const smile = useRef(new Animated.Value(0)).current;
  const speck = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const bgShift = useRef(new Animated.Value(0)).current;
  const contentOut = useRef(new Animated.Value(1)).current;
  const exitBackgroundRef = useRef(exitBackground);
  exitBackgroundRef.current = exitBackground;
  const reducedRef = useRef(false);

  const introDoneRef = useRef(false);
  const finishedRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const loopsRef = useRef<{ speck?: Animated.CompositeAnimation; breath?: Animated.CompositeAnimation }>(
    {}
  );

  const tryExit = useCallback(() => {
    if (finishedRef.current) return;
    if (!introDoneRef.current) return;
    if (!readyRef.current) return;
    if (!onFinishedRef.current) return;
    finishedRef.current = true;
    loopsRef.current.speck?.stop();
    loopsRef.current.breath?.stop();
    const duration = reducedRef.current ? 150 : EXIT_MS;
    if (exitBackgroundRef.current) {
      // Emerald → next screen's background, mark fades out on top. When done the
      // overlay is the same colour as the screen below, so unmounting is seamless.
      Animated.parallel([
        Animated.timing(bgShift, {
          toValue: 1,
          duration,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(contentOut, {
          toValue: 0,
          duration: Math.round(duration * 0.7),
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onFinishedRef.current?.();
      });
      return;
    }
    Animated.timing(exit, {
      toValue: 0,
      duration,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinishedRef.current?.();
    });
  }, [bgShift, contentOut, exit]);

  const startLoops = useCallback(() => {
    const speckLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(speck, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(speck, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const breathLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loopsRef.current = { speck: speckLoop, breath: breathLoop };
    speckLoop.start();
    breathLoop.start();
  }, [breath, speck]);

  const markIntroDone = useCallback(() => {
    introDoneRef.current = true;
    tryExit();
  }, [tryExit]);

  useEffect(() => {
    let cancelled = false;
    let safety: ReturnType<typeof setTimeout> | undefined;

    const play = (reduced: boolean) => {
      if (cancelled) return;
      reducedRef.current = reduced;
      if (reduced) {
        grow.setValue(1);
        smile.setValue(1);
        enter.setValue(1);
        markIntroDone();
        return;
      }

      Animated.timing(enter, {
        toValue: 1,
        duration: 280,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();

      Animated.sequence([
        Animated.timing(grow, {
          toValue: 1,
          duration: 680,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(smile, {
          toValue: 1,
          duration: 360,
          easing: EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.delay(420),
      ]).start(({ finished }) => {
        if (!finished || cancelled) return;
        startLoops();
        markIntroDone();
      });
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => play(!!reduced))
      .catch(() => play(false));

    if (onFinishedRef.current) {
      safety = setTimeout(() => {
        grow.setValue(1);
        smile.setValue(1);
        enter.setValue(1);
        markIntroDone();
      }, SAFETY_MS);
    }

    return () => {
      cancelled = true;
      if (safety) clearTimeout(safety);
      loopsRef.current.speck?.stop();
      loopsRef.current.breath?.stop();
    };
  }, [enter, grow, markIntroDone, smile, startLoops]);

  useEffect(() => {
    tryExit();
  }, [ready, tryExit]);

  const seedScale = Animated.multiply(
    grow.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }),
    breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })
  );
  const contentY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const seedSize = variant === 'splash' ? 96 : 84;

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: palette.bg, opacity: exit }]}
      accessibilityRole="progressbar"
      onLayout={onLayout}
    >
      {manageStatusBar ? <StatusBar style={palette.status} /> : null}

      {exitBackground ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: exitBackground, opacity: bgShift }]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.content,
          {
            opacity: Animated.multiply(enter, contentOut),
            transform: [{ translateY: contentY }],
          },
        ]}
      >
        {showWordmark ? (
          <Animated.Text style={[styles.wordmark, { color: palette.wordmark, opacity: smile }]}>
            Grow!
          </Animated.Text>
        ) : null}

        <View style={styles.stage}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.speck,
              {
                backgroundColor: palette.speck,
                opacity: speck,
                transform: [
                  {
                    translateY: speck.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, -seedSize * 0.62],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.stem,
              {
                backgroundColor: palette.stem,
                opacity: grow,
                transform: [{ scaleY: grow }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.seed,
              {
                width: seedSize,
                height: seedSize,
                borderRadius: seedSize / 2,
                backgroundColor: palette.seed,
                transform: [{ scale: seedScale }],
              },
            ]}
          >
            <Animated.Text
              style={[
                styles.face,
                {
                  fontSize: Math.round(seedSize * 0.34),
                  color: palette.smile,
                  opacity: smile,
                },
              ]}
            >
              ◡
            </Animated.Text>
          </Animated.View>
        </View>

        {message ? (
          <Animated.Text style={[styles.message, { color: palette.message, opacity: smile }]}>
            {message}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 28,
  },
  stage: {
    width: 140,
    height: 160,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 28,
  },
  seed: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    fontWeight: '700',
    marginTop: -2,
  },
  stem: {
    width: 3,
    height: 36,
    borderRadius: 2,
    marginBottom: 6,
  },
  speck: {
    position: 'absolute',
    top: 28,
    width: 8,
    height: 10,
    borderRadius: 6,
  },
  message: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
});

/** @deprecated Prefer BrandLoadingScreen — kept as thin alias for existing imports */
export function FullScreenBrandLoader(props: Props) {
  return <BrandLoadingScreen {...props} />;
}

export const SPLASH_INTRO_MS = INTRO_MS;
