import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../../lib/tw';
import { triggerFeedback } from '../../utils/interactionFeedback';
import { markFirstOpenSeen, resolveBootMode, type BootMode } from '../../utils/firstLaunch';

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
  /**
   * Cold-start only. `daily` = ~0.5s wake-up, `first` = ~1.6s sprout intro,
   * `auto` = read the `grow.firstOpenSeen` flag (capped at 100ms → daily).
   * Omit for in-app loaders (classic grow + breath loop).
   */
  mode?: BootMode | 'auto';
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
    leaf: 'rgba(243,238,228,0.92)',
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
    leaf: '#10B981',
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
    leaf: '#10B981',
    status: 'light' as const,
  },
};

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Grow + smile + hold. Breath loops after that until `ready`. */
const INTRO_MS = 680 + 360 + 420;
const EXIT_MS = 340;
const SAFETY_MS = 5200;

/* Cold-start timings (ms). */
/** Daily: earliest exit (exit waits for max(this, ready)). */
const DAILY_MIN_MS = 220;
const DAILY_EXIT_MS = 280;
/** Daily: still not ready → show wordmark + "Still growing." and breathe. */
const DAILY_SLOW_MS = 1200;
const DAILY_HAPTIC_MS = 200;
/** First launch: smile + bloom haptic, tagline, then hold until exit. */
const FIRST_SMILE_MS = 600;
const FIRST_TAGLINE_MS = 760;
const FIRST_HOLD_MS = 1300;
const REDUCED_EXIT_MS = 150;
const STEM_H = 36;

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
  mode,
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
  // Cold-start (mode) values
  const bootMode = useRef(mode).current;
  const isBoot = !!bootMode;
  const wake = useRef(new Animated.Value(1)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const stem = useRef(new Animated.Value(0)).current;
  const leafL = useRef(new Animated.Value(0)).current;
  const leafR = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const taglineRise = useRef(new Animated.Value(8)).current;
  const late = useRef(new Animated.Value(0)).current;
  const resolvedModeRef = useRef<BootMode>('daily');
  const [exiting, setExiting] = useState(false);

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
    let duration = reducedRef.current ? REDUCED_EXIT_MS : EXIT_MS;
    if (isBoot) {
      // Icons go dark as the exit starts, not at unmount, so they never sit
      // white over the cream page underneath.
      setExiting(true);
      if (!reducedRef.current && resolvedModeRef.current === 'daily') duration = DAILY_EXIT_MS;
    }
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
    const fade = Animated.timing(exit, {
      toValue: 0,
      duration,
      easing: EASE_OUT,
      useNativeDriver: true,
    });
    const anim =
      isBoot && !reducedRef.current
        ? Animated.parallel([
            fade,
            Animated.timing(exitScale, {
              toValue: 1.12,
              duration,
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
          ])
        : fade;
    anim.start(({ finished }) => {
      if (finished) onFinishedRef.current?.();
    });
  }, [bgShift, contentOut, exit, exitScale, isBoot]);

  const startLoops = useCallback((withSpeck = true) => {
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
    loopsRef.current = { speck: withSpeck ? speckLoop : undefined, breath: breathLoop };
    if (withSpeck) speckLoop.start();
    breathLoop.start();
  }, [breath, speck]);

  const markIntroDone = useCallback(() => {
    introDoneRef.current = true;
    tryExit();
  }, [tryExit]);

  // Classic in-app loader (no `mode`).
  useEffect(() => {
    if (isBoot) return undefined;
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
  }, [enter, grow, isBoot, markIntroDone, smile, startLoops]);

  // Cold start: daily wake-up or first-launch sprout.
  useEffect(() => {
    if (!bootMode) return undefined;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms)
      );
    };
    const showAll = () => {
      enter.setValue(1);
      wake.setValue(1);
      stem.setValue(1);
      smile.setValue(1);
    };

    const playDaily = (reduced: boolean) => {
      // Final layout from frame one: seed at full size, stem up, no leaves.
      showAll();
      smile.setValue(0);
      if (!reduced) {
        Animated.sequence([
          Animated.timing(wake, {
            toValue: 1.06,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(wake, {
            toValue: 1,
            damping: 14,
            stiffness: 220,
            mass: 1,
            useNativeDriver: true,
          }),
        ]).start();
      }
      Animated.timing(smile, {
        toValue: 1,
        duration: 180,
        delay: 60,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
      later(DAILY_HAPTIC_MS, () => triggerFeedback('bloom'));
      later(DAILY_MIN_MS, markIntroDone);
      later(DAILY_SLOW_MS, () => {
        if (finishedRef.current || readyRef.current) return;
        // Slow network: say so, and let the seed breathe while we wait.
        Animated.timing(late, {
          toValue: 1,
          duration: 320,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
        if (!reduced) startLoops(false);
      });
    };

    const playFirst = (reduced: boolean) => {
      if (reduced) {
        enter.setValue(1);
        wake.setValue(1);
        stem.setValue(1);
        leafL.setValue(1);
        leafR.setValue(1);
        taglineRise.setValue(0);
      } else {
        wake.setValue(0.34);
        Animated.timing(enter, {
          toValue: 1,
          duration: 200,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
        Animated.spring(wake, {
          toValue: 1,
          damping: 12,
          stiffness: 140,
          mass: 1,
          useNativeDriver: true,
        }).start();
        Animated.timing(stem, {
          toValue: 1,
          duration: 300,
          delay: 200,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
        const leafSpring = (v: Animated.Value) =>
          Animated.spring(v, { toValue: 1, damping: 10, stiffness: 180, mass: 1, useNativeDriver: true });
        Animated.sequence([
          Animated.delay(380),
          Animated.stagger(80, [leafSpring(leafL), leafSpring(leafR)]),
        ]).start();
        Animated.timing(taglineRise, {
          toValue: 0,
          duration: 240,
          delay: FIRST_TAGLINE_MS,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
      }
      Animated.timing(smile, {
        toValue: 1,
        duration: 220,
        delay: FIRST_SMILE_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
      later(FIRST_SMILE_MS, () => triggerFeedback('bloom'));
      Animated.timing(tagline, {
        toValue: 1,
        duration: 240,
        delay: FIRST_TAGLINE_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
      later(FIRST_HOLD_MS, () => {
        markFirstOpenSeen();
        markIntroDone();
        if (!finishedRef.current && !reduced) startLoops(false);
      });
    };

    const reducedP = AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => !!r)
      .catch(() => false);
    const modeP: Promise<BootMode> =
      bootMode === 'auto' ? resolveBootMode(100) : Promise.resolve(bootMode);

    Promise.all([reducedP, modeP]).then(([reduced, m]) => {
      if (cancelled || finishedRef.current) return;
      reducedRef.current = reduced;
      resolvedModeRef.current = m;
      if (m === 'first') playFirst(reduced);
      else playDaily(reduced);
    });

    const safety = setTimeout(() => {
      if (cancelled) return;
      showAll();
      leafL.setValue(resolvedModeRef.current === 'first' ? 1 : 0);
      leafR.setValue(resolvedModeRef.current === 'first' ? 1 : 0);
      markIntroDone();
    }, SAFETY_MS);

    return () => {
      cancelled = true;
      clearTimeout(safety);
      timers.forEach(clearTimeout);
      loopsRef.current.speck?.stop();
      loopsRef.current.breath?.stop();
    };
  }, [
    bootMode,
    enter,
    late,
    leafL,
    leafR,
    markIntroDone,
    smile,
    startLoops,
    stem,
    tagline,
    taglineRise,
    wake,
  ]);

  useEffect(() => {
    tryExit();
  }, [ready, tryExit]);

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const seedScale = isBoot
    ? Animated.multiply(Animated.multiply(wake, breathScale), exitScale)
    : Animated.multiply(grow.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }), breathScale);
  const contentY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  const seedSize = variant === 'splash' ? 96 : 84;

  return (
    <Animated.View
      style={[styles.root, { backgroundColor: palette.bg, opacity: exit }]}
      accessibilityRole="progressbar"
      onLayout={onLayout}
    >
      {manageStatusBar ? (
        <StatusBar style={isBoot && exiting ? 'dark' : palette.status} />
      ) : null}

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
            transform: isBoot ? [] : [{ translateY: contentY }],
          },
        ]}
      >
        {isBoot ? (
          // Fixed-height slots keep the seed's centre on the screen centre
          // whether or not the wordmark / message are showing.
          <View style={styles.bootTop}>
            {showWordmark ? (
              <Animated.Text style={[styles.wordmark, { color: palette.wordmark, opacity: late }]}>
                Grow!
              </Animated.Text>
            ) : null}
          </View>
        ) : showWordmark ? (
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
          {isBoot ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.leaf,
                  styles.leafLeft,
                  { backgroundColor: palette.leaf, transform: [{ rotate: '35deg' }, { scale: leafL }] },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.leaf,
                  styles.leafRight,
                  { backgroundColor: palette.leaf, transform: [{ rotate: '-35deg' }, { scale: leafR }] },
                ]}
              />
            </>
          ) : null}
          <Animated.View
            style={[
              styles.stem,
              isBoot
                ? {
                    backgroundColor: palette.stem,
                    opacity: stem,
                    // Grow from the base: scale about the centre, then shift down.
                    transform: [
                      {
                        translateY: stem.interpolate({
                          inputRange: [0, 1],
                          outputRange: [STEM_H / 2, 0],
                        }),
                      },
                      { scaleY: stem },
                    ],
                  }
                : {
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

        {isBoot ? (
          <View style={styles.bootBottom}>
            <Animated.Text
              style={[
                styles.tagline,
                styles.bootLine,
                {
                  color: palette.wordmark,
                  opacity: tagline,
                  transform: [{ translateY: taglineRise }],
                },
              ]}
            >
              {"Let's grow."}
            </Animated.Text>
            {message ? (
              <Animated.Text
                style={[styles.message, styles.bootLine, { color: palette.message, opacity: late }]}
              >
                {message}
              </Animated.Text>
            ) : null}
          </View>
        ) : message ? (
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
    height: STEM_H,
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
  // Column = top(72) + stage(160) + gap(28) + bottom(108); the seed centre
  // (stage bottom − 48) then lands exactly on the column centre.
  bootTop: {
    height: 72,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bootBottom: {
    height: 108,
    width: 280,
    alignItems: 'center',
  },
  bootLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  // Stem spans y 22–58 in the 160-tall stage (seed 96 + 6 gap below it).
  leaf: {
    position: 'absolute',
    top: 24,
    width: 18,
    height: 11,
  },
  leafLeft: {
    left: 70 - 18 + 1,
    borderTopLeftRadius: 11,
    borderBottomRightRadius: 11,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
  },
  leafRight: {
    left: 70 - 1,
    top: 30,
    borderTopRightRadius: 11,
    borderBottomLeftRadius: 11,
    borderTopLeftRadius: 2,
    borderBottomRightRadius: 2,
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
