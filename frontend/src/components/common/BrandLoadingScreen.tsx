import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme, getColorSchemeName } from '../../lib/tw';
import { easing as motionEasing } from '../../theme/motion';
import { triggerFeedback } from '../../utils/interactionFeedback';
import { markFirstOpenSeen, resolveBootMode, type BootMode } from '../../utils/firstLaunch';
import { markBootRevealStart } from '../auth/bootSplashSignal';

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
  /** Fired when the loader layout is ready. */
  onLayout?: () => void;
  /**
   * Cold-start only: fired once the brand mark has actually loaded at the
   * native splash rect (both image layers `onLoadEnd` + full-screen layout),
   * i.e. the JS frame now looks exactly like the native splash. Hide the
   * native splash here, not on layout.
   */
  onMarkPainted?: () => void;
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
   * Cold-start only. `daily` = ~0.4s wake-up, `first` = ~1.3s sprout intro,
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
  // Getter: scheme-aware colours must be read at render, not at import.
  get page() {
    return {
      bg: theme.colors.page,
      seed: '#059669',
      smile: '#ECFDF5',
      speck: '#F97066',
      wordmark: theme.colors.brand,
      message: theme.colors.textMuted,
      stem: 'rgba(5,150,105,0.22)',
      leaf: '#10B981',
      status: (getColorSchemeName() === 'dark' ? 'light' : 'dark') as 'light' | 'dark',
    };
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

const EASE_OUT = motionEasing.out;
const OUT_CUBIC = Easing.out(Easing.cubic);

/** Grow + smile + hold. Breath loops after that until `ready`. */
const INTRO_MS = 680 + 360 + 420;
const EXIT_MS = 340;
const SAFETY_MS = 5200;

/**
 * Default export: cold start (`mode` set) renders the brand-mark boot splash;
 * everything else (in-app gates, page/dark variants) keeps the classic seed.
 * `mode` is fixed for the life of a mount.
 */
export default function BrandLoadingScreen(props: Props) {
  const isBoot = useRef(!!props.mode).current;
  return isBoot ? <BootSplash {...props} /> : <ClassicLoader {...props} />;
}

/* ------------------------------------------------------------------------ */
/* Cold start: the brand mark, handed off pixel-for-pixel from native.      */
/* ------------------------------------------------------------------------ */

/**
 * Must match app.config.ts → splash / expo-splash-screen `imageWidth`.
 * iOS centres the image in the launch storyboard's full-screen container;
 * Android 12+ centres it in the window. Both: the full screen, no insets.
 */
const MARK = 128;
const HALO_D = MARK * 2.4;
const LEAF_SRC = require('../../../assets/boot/leaf.png');
const SMILE_SRC = require('../../../assets/boot/smile.png');
/** Leaf base (where it meets the smile) relative to the mark centre, in pt. Pivot for tilt/dip. */
const LEAF_PIVOT = { x: -5, y: 19 };

/* Daily (ms from the JS frame that matches the native splash). */
const D_WAKE_AT = 90;
const D_WAKE_MS = 140;
const D_HAPTIC_MS = 230;
const D_HALO_MS = 240;
/** Earliest exit; actual exit = max(this, ready). */
const D_MIN_MS = 380;
/** Still not ready → wordmark + "Still growing." and breathe. */
const D_SLOW_MS = 1200;

/* First launch. */
const F_DIP_AT = 120;
const F_DIP_MS = 200;
const F_SPROUT_AT = 320;
const F_HALO_AT = 380;
const F_HALO_MS = 300;
const F_HAPTIC_MS = 560;
const F_TAGLINE_AT = 700;
const F_HOLD_MS = 1300;

/* Exit. */
const X_MARK_MS = 260;
const X_MARK_FADE_MS = 160;
const X_BG_DELAY = 40;
const X_BG_MS = 260;
const REDUCED_EXIT_MS = 150;
/** Native splash safety in case an image never reports load. */
const PAINT_FALLBACK_MS = 2500;

type Halo = { color: string; opacity: number; dusk: number };

/** Same hour bands as src/utils/greeting.ts (05–11, 12–17, 18–22, 23–04). */
export function haloForHour(hour: number): Halo {
  if (hour >= 5 && hour <= 11) return { color: '#FCD34D', opacity: 0.18, dusk: 0 };
  if (hour >= 12 && hour <= 17) return { color: '#ECFDF5', opacity: 0.1, dusk: 0 };
  if (hour >= 18 && hour <= 22) return { color: '#FDBA74', opacity: 0.1, dusk: 0.15 };
  return { color: '#064E3B', opacity: 0.25, dusk: 0 };
}

/** The halo's soft blend + big scale is the costliest layer; skip it on old Android. */
const LITE =
  Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version < 29;

function BootSplash({
  message,
  showWordmark = true,
  manageStatusBar = true,
  onLayout,
  onMarkPainted,
  ready = true,
  onFinished,
  exitBackground,
  mode,
}: Props) {
  const palette = PALETTE.splash;
  const halo = useRef(haloForHour(new Date().getHours())).current;

  // Native-splash rect. Seeded from the window so images start loading on the
  // first render; corrected by the root (full-screen) onLayout before we paint.
  const [size, setSize] = useState(() => {
    const w = Dimensions.get('window');
    return { w: w.width, h: w.height };
  });

  // Every value starts at its "identical to native splash" state.
  const bgOpacity = useRef(new Animated.Value(1)).current;
  const bgShift = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const dusk = useRef(new Animated.Value(0)).current;
  const wake = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const exitScale = useRef(new Animated.Value(1)).current;
  const markOpacity = useRef(new Animated.Value(1)).current;
  const leafY = useRef(new Animated.Value(0)).current;
  const leafTilt = useRef(new Animated.Value(0)).current; // degrees
  const leafScale = useRef(new Animated.Value(1)).current;
  const smileX = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(1)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const taglineRise = useRef(new Animated.Value(8)).current;
  const late = useRef(new Animated.Value(0)).current;

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
  const onMarkPaintedRef = useRef(onMarkPainted);
  onMarkPaintedRef.current = onMarkPainted;
  const breathLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ---- Paint gate: layout + both mark layers loaded → hide native, start timeline.
  const paintRef = useRef({ layout: false, leaf: false, smile: false, fired: false });
  const startTimelineRef = useRef<(() => void) | null>(null);
  const firePaintedIfReady = useCallback(() => {
    const g = paintRef.current;
    if (g.fired || !g.layout || !g.leaf || !g.smile) return;
    g.fired = true;
    onMarkPaintedRef.current?.();
    startTimelineRef.current?.();
  }, []);
  const forcePainted = useCallback(() => {
    const g = paintRef.current;
    g.layout = g.leaf = g.smile = true;
    firePaintedIfReady();
  }, [firePaintedIfReady]);

  const handleRootLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
      onLayout?.();
      // Let the corrected position commit before we report "painted".
      requestAnimationFrame(() => {
        paintRef.current.layout = true;
        firePaintedIfReady();
      });
    },
    [firePaintedIfReady, onLayout],
  );
  const onLeafLoaded = useCallback(() => {
    paintRef.current.leaf = true;
    firePaintedIfReady();
  }, [firePaintedIfReady]);
  const onSmileLoaded = useCallback(() => {
    paintRef.current.smile = true;
    firePaintedIfReady();
  }, [firePaintedIfReady]);

  const tryExit = useCallback(() => {
    if (finishedRef.current) return;
    if (!introDoneRef.current) return;
    if (!readyRef.current) return;
    if (!onFinishedRef.current) return;
    finishedRef.current = true;
    breathLoopRef.current?.stop();
    const reduced = reducedRef.current;
    // Icons go dark as the exit starts, not at unmount, so they never sit
    // white over the cream page underneath.
    setExiting(true);
    markBootRevealStart({ animate: !reduced });
    const done = ({ finished }: { finished: boolean }) => {
      if (finished) onFinishedRef.current?.();
    };
    const toCream = !!exitBackgroundRef.current;

    if (reduced || LITE) {
      const ms = reduced ? REDUCED_EXIT_MS : X_BG_MS;
      const anims: Animated.CompositeAnimation[] = toCream
        ? [
            Animated.timing(bgShift, {
              toValue: 1,
              duration: ms,
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
            Animated.timing(markOpacity, {
              toValue: 0,
              duration: Math.round(ms * 0.7),
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
          ]
        : [
            Animated.timing(rootOpacity, {
              toValue: 0,
              duration: ms,
              easing: EASE_OUT,
              useNativeDriver: true,
            }),
          ];
      Animated.parallel(anims).start(done);
      return;
    }

    Animated.parallel([
      Animated.timing(exitScale, {
        toValue: 1.8,
        duration: X_MARK_MS,
        easing: motionEasing.standard,
        useNativeDriver: true,
      }),
      Animated.timing(markOpacity, {
        toValue: 0,
        duration: X_MARK_FADE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(haloScale, {
        toValue: 5,
        duration: X_MARK_MS,
        easing: motionEasing.standard,
        useNativeDriver: true,
      }),
      Animated.timing(haloOpacity, {
        toValue: 0,
        duration: X_MARK_MS,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(tagline, { toValue: 0, duration: X_MARK_FADE_MS, useNativeDriver: true }),
      Animated.timing(late, { toValue: 0, duration: X_MARK_FADE_MS, useNativeDriver: true }),
      toCream
        ? // Signed out: emerald → cream auth page; unmount is then seamless.
          Animated.timing(bgShift, {
            toValue: 1,
            duration: X_BG_MS,
            delay: X_BG_DELAY,
            easing: EASE_OUT,
            useNativeDriver: true,
          })
        : // Signed in: the emerald lifts off Home (which settles 1.03 → 1 underneath).
          Animated.timing(bgOpacity, {
            toValue: 0,
            duration: X_BG_MS,
            delay: X_BG_DELAY,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
    ]).start(done);
  }, [
    bgOpacity,
    bgShift,
    exitScale,
    haloOpacity,
    haloScale,
    late,
    markOpacity,
    rootOpacity,
    tagline,
  ]);

  const markIntroDone = useCallback(() => {
    introDoneRef.current = true;
    tryExit();
  }, [tryExit]);

  const startBreath = useCallback(() => {
    if (reducedRef.current || breathLoopRef.current) return;
    const loop = Animated.loop(
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
      ]),
    );
    breathLoopRef.current = loop;
    loop.start();
  }, [breath]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };

    const haloIn = (to: number, ms: number, delay: number) => {
      if (LITE) return;
      Animated.timing(haloOpacity, {
        toValue: to,
        duration: ms,
        delay,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
      if (halo.dusk > 0) {
        Animated.timing(dusk, {
          toValue: halo.dusk,
          duration: ms,
          delay,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
      }
    };

    const settle = (v: Animated.Value, toValue: number) =>
      Animated.spring(v, { toValue, damping: 12, stiffness: 200, mass: 1, useNativeDriver: true });
    const t140 = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, {
        toValue,
        duration: D_WAKE_MS,
        easing: OUT_CUBIC,
        useNativeDriver: true,
      });

    const playDaily = (reduced: boolean) => {
      if (!reduced) {
        // t=90 wake (140ms) → t=230 spring settle.
        Animated.sequence([
          Animated.delay(D_WAKE_AT),
          Animated.parallel([
            t140(wake, 1.05),
            t140(leafY, -6),
            t140(leafTilt, -5),
            t140(smileX, 1.06),
          ]),
          Animated.parallel([
            settle(wake, 1),
            settle(leafY, 0),
            settle(leafTilt, 0),
            settle(smileX, 1),
          ]),
        ]).start();
        haloIn(halo.opacity, D_HALO_MS, D_WAKE_AT);
      }
      later(D_HAPTIC_MS, () => triggerFeedback('bloom'));
      later(D_MIN_MS, markIntroDone);
      later(D_SLOW_MS, () => {
        if (finishedRef.current || readyRef.current) return;
        // Slow network: say so, and let the mark breathe while we wait.
        Animated.timing(late, {
          toValue: 1,
          duration: 320,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
        startBreath();
      });
    };

    const playFirst = (reduced: boolean) => {
      if (reduced) {
        tagline.setValue(1);
        taglineRise.setValue(0);
      } else {
        // Leaf dips into the smile (tilting as it goes)…
        Animated.timing(leafY, {
          toValue: 10,
          duration: F_DIP_MS,
          delay: F_DIP_AT,
          easing: motionEasing.standard,
          useNativeDriver: true,
        }).start();
        Animated.timing(leafScale, {
          toValue: 0.9,
          duration: F_DIP_MS,
          delay: F_DIP_AT,
          easing: motionEasing.standard,
          useNativeDriver: true,
        }).start();
        Animated.timing(leafTilt, {
          toValue: -12,
          duration: F_DIP_MS,
          delay: F_DIP_AT,
          easing: motionEasing.standard,
          useNativeDriver: true,
        }).start();
        // …then sprouts back up: −12° → 0, scale → 1.
        const sprout = (v: Animated.Value, toValue: number) =>
          Animated.spring(v, {
            toValue,
            damping: 10,
            stiffness: 160,
            mass: 1,
            delay: F_SPROUT_AT,
            useNativeDriver: true,
          });
        Animated.parallel([sprout(leafY, 0), sprout(leafTilt, 0), sprout(leafScale, 1)]).start();
        if (!LITE) {
          haloScale.setValue(0.85);
          Animated.timing(haloScale, {
            toValue: 1,
            duration: F_HALO_MS,
            delay: F_HALO_AT,
            easing: EASE_OUT,
            useNativeDriver: true,
          }).start();
        }
        haloIn(0.2, F_HALO_MS, F_HALO_AT);
        Animated.parallel([
          Animated.timing(tagline, {
            toValue: 1,
            duration: 240,
            delay: F_TAGLINE_AT,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
          Animated.timing(taglineRise, {
            toValue: 0,
            duration: 240,
            delay: F_TAGLINE_AT,
            easing: EASE_OUT,
            useNativeDriver: true,
          }),
        ]).start();
      }
      later(F_HAPTIC_MS, () => triggerFeedback('bloom'));
      later(F_HOLD_MS, () => {
        markFirstOpenSeen();
        markIntroDone();
        if (!finishedRef.current) startBreath();
      });
    };

    const reducedP = AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => !!r)
      .catch(() => false);
    const modeP: Promise<BootMode> =
      !mode || mode === 'auto' ? resolveBootMode(100) : Promise.resolve(mode);
    // The timeline starts when the mark is on screen (native splash hidden)
    // AND we know the mode — never under the native splash.
    const paintedP = new Promise<void>((resolve) => {
      startTimelineRef.current = resolve;
      if (paintRef.current.fired) resolve();
    });
    later(PAINT_FALLBACK_MS, forcePainted);

    Promise.all([reducedP, modeP, paintedP]).then(([reduced, m]) => {
      if (cancelled || finishedRef.current) return;
      reducedRef.current = reduced;
      if (m === 'first') playFirst(reduced);
      else playDaily(reduced);
    });

    const safety = setTimeout(() => {
      if (cancelled) return;
      markIntroDone();
    }, SAFETY_MS);

    return () => {
      cancelled = true;
      clearTimeout(safety);
      timers.forEach(clearTimeout);
      breathLoopRef.current?.stop();
    };
    // Mount-only: the boot timeline runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tryExit();
  }, [ready, tryExit]);

  const cx = size.w / 2;
  const cy = size.h / 2;
  const markLeft = (size.w - MARK) / 2;
  const markTop = (size.h - MARK) / 2;
  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const groupScale = Animated.multiply(Animated.multiply(wake, breathScale), exitScale);
  const leafRotate = leafTilt.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  return (
    <Animated.View
      style={[styles.bootRoot, { opacity: rootOpacity }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Grow! is opening"
      onLayout={handleRootLayout}
    >
      {manageStatusBar ? <StatusBar style={exiting ? (getColorSchemeName() === 'dark' ? 'light' : 'dark') : palette.status} /> : null}

      {/* Emerald field (+ evening dusk tint). Fades off Home when signed in. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg, opacity: bgOpacity }]}
      >
        {halo.dusk > 0 ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#065F46', opacity: dusk }]}
          />
        ) : null}
      </Animated.View>

      {exitBackground ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: exitBackground, opacity: bgShift }]}
        />
      ) : null}

      {LITE ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              left: cx - HALO_D / 2,
              top: cy - HALO_D / 2,
              backgroundColor: halo.color,
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
      )}

      {/* The mark: exactly the native splash rect (full-screen centre, 128×128). */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.mark,
          {
            left: markLeft,
            top: markTop,
            opacity: markOpacity,
            transform: [{ scale: groupScale }],
          },
        ]}
      >
        <Animated.Image
          source={LEAF_SRC}
          onLoadEnd={onLeafLoaded}
          fadeDuration={0}
          resizeMode="contain"
          style={[
            styles.markLayer,
            {
              transform: [
                { translateY: leafY },
                { translateX: LEAF_PIVOT.x },
                { translateY: LEAF_PIVOT.y },
                { rotate: leafRotate },
                { scale: leafScale },
                { translateX: -LEAF_PIVOT.x },
                { translateY: -LEAF_PIVOT.y },
              ],
            },
          ]}
        />
        <Animated.Image
          source={SMILE_SRC}
          onLoadEnd={onSmileLoaded}
          fadeDuration={0}
          resizeMode="contain"
          style={[styles.markLayer, { transform: [{ scaleX: smileX }] }]}
        />
      </Animated.View>

      {showWordmark ? (
        <Animated.Text
          style={[
            styles.wordmark,
            styles.bootLine,
            { bottom: size.h - (cy - MARK / 2 - 28), color: palette.wordmark, opacity: late },
          ]}
        >
          Grow!
        </Animated.Text>
      ) : null}
      <Animated.Text
        style={[
          styles.tagline,
          styles.bootLine,
          {
            top: cy + MARK / 2 + 28,
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
          style={[
            styles.bootMessage,
            styles.bootLine,
            { top: cy + MARK / 2 + 28, color: palette.message, opacity: late },
          ]}
        >
          {message}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------------ */
/* Classic in-app loader — a seed that swells and smiles.                   */
/* ------------------------------------------------------------------------ */

/**
 * Gate loader — a seed that swells and smiles.
 * Not a spinner, not orbit rings, not a leaf.
 */
function ClassicLoader({
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

  const loopsRef = useRef<{
    speck?: Animated.CompositeAnimation;
    breath?: Animated.CompositeAnimation;
  }>({});

  const tryExit = useCallback(() => {
    if (finishedRef.current) return;
    if (!introDoneRef.current) return;
    if (!readyRef.current) return;
    if (!onFinishedRef.current) return;
    finishedRef.current = true;
    loopsRef.current.speck?.stop();
    loopsRef.current.breath?.stop();
    const duration = reducedRef.current ? REDUCED_EXIT_MS : EXIT_MS;
    if (exitBackgroundRef.current) {
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
      ]),
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
      ]),
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

  const breathScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const seedScale = Animated.multiply(
    grow.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }),
    breathScale,
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
  bootRoot: {
    flex: 1,
  },
  halo: {
    position: 'absolute',
    width: HALO_D,
    height: HALO_D,
    borderRadius: HALO_D / 2,
  },
  mark: {
    position: 'absolute',
    width: MARK,
    height: MARK,
  },
  markLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MARK,
    height: MARK,
  },
  bootLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    marginBottom: 0,
    textAlign: 'center',
  },
  bootMessage: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
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
  tagline: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
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
