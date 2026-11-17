import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, type ToastItem } from '../../state/useToastStore';
import { duration, easing, spring, timing } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { haptic } from '../../theme/haptics';
import { useColorSchemeName } from '../../theme/scheme';
import { radius } from '../../theme/tokens';

/** Distance the pill sits above the bottom safe-area inset — clears the floating dock. */
const TOAST_DOCK_CLEARANCE = 84;
/** Toast rises from this many px below its resting spot. */
const ENTER_OFFSET = 16;
/** Downward drag (px) past which a swipe dismisses. */
const SWIPE_DISMISS = 24;

/**
 * App-wide toast host. Mount once (App.tsx), after navigation and before modal
 * hosts. Shows `useToastStore().current` as a dark pill above the dock.
 * Use the `toast.success(msg)` / `toast.info(msg)` helpers to trigger.
 */
export default function ToastHost() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  // Light: inverse ink pill on cream. Dark: a lifted night-soil pill with a
  // hairline so it separates from the page (an ink pill would glare).
  const dark = useColorSchemeName() === 'dark';
  const reduced = useReducedMotion();

  // `shown` lags `current` so the exit animation can play with the old content.
  const [shown, setShown] = useState<ToastItem | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ENTER_OFFSET)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const hideRef = useRef(hide);
  hideRef.current = hide;
  const idRef = useRef<number | null>(null);

  // Enter / replace / exit.
  useEffect(() => {
    if (current) {
      idRef.current = current.id;
      setShown(current);
      drag.setValue(0);
      opacity.setValue(0);
      translateY.setValue(reduced ? 0 : ENTER_OFFSET);
      Animated.parallel([
        timing(opacity, 1, { duration: duration.quick, easing: easing.out }, reduced),
        spring(translateY, 0, 'snappy', reduced),
      ]).start();
      if (current.tone === 'success') haptic('success');
      AccessibilityInfo.announceForAccessibility(current.message);
      const t = setTimeout(() => hideRef.current(current.id), current.durationMs);
      return () => clearTimeout(t);
    }
    idRef.current = null;
    Animated.parallel([
      timing(opacity, 0, { duration: duration.quick, easing: easing.in }, reduced),
      timing(translateY, reduced ? 0 : ENTER_OFFSET / 2, { duration: duration.quick, easing: easing.in }, reduced),
    ]).start(({ finished }) => {
      if (finished && idRef.current === null) setShown(null);
    });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, reduced]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        drag.setValue(g.dy > 0 ? g.dy : g.dy / 4);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > SWIPE_DISMISS || g.vy > 0.6) {
          hideRef.current(idRef.current ?? undefined);
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 320 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 320 }).start();
      },
    })
  ).current;

  if (!shown) return null;

  const iconName = (shown.icon ||
    (shown.tone === 'success' ? 'checkmark-circle' : 'information-circle')) as keyof typeof Ionicons.glyphMap;
  const iconColor = shown.tone === 'success' ? '#34D399' : '#A8A29E';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + TOAST_DOCK_CLEARANCE }]}
    >
      <Animated.View
        {...pan.panHandlers}
        accessibilityLiveRegion="polite"
        style={[
          styles.pill,
          dark ? styles.pillDark : null,
          { opacity, transform: [{ translateY: Animated.add(translateY, drag) }] },
        ]}
      >
        <Pressable
          onPress={() => hide(shown.id)}
          accessibilityRole="alert"
          accessibilityLabel={shown.message}
          accessibilityHint="Tap to dismiss"
          style={styles.body}
        >
          <Ionicons name={iconName} size={18} color={iconColor} />
          <Text style={styles.text} numberOfLines={2}>
            {shown.message}
          </Text>
        </Pressable>
        {shown.action ? (
          <Pressable
            onPress={() => {
              const action = shown.action;
              hide(shown.id);
              action?.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={shown.action.label}
            hitSlop={8}
            style={styles.action}
          >
            <Text style={styles.actionText}>{shown.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 420,
    backgroundColor: '#1C1917', // stone-900 (light only; pillDark overrides)
    borderRadius: radius.chip,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 44,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pillDark: {
    backgroundColor: '#2E2A26',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowOpacity: 0.4,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    paddingVertical: 11,
    paddingRight: 10,
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  actionText: {
    color: '#6EE7B7',
    fontSize: 14,
    fontWeight: '700',
  },
});
