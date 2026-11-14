import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useColorSchemeName } from '../../lib/tw';
import { radius, type } from '../../theme/tokens';

/**
 * Small non-blocking pill under the status bar while the device is offline.
 * Overlays content (pointerEvents none) so it never shifts layouts or eats taps.
 */
export default function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  // Light: ink pill on cream. Dark: lifted night-soil pill + hairline (matches Toast).
  const dark = useColorSchemeName() === 'dark';

  useEffect(() => {
    if (isOffline) setMounted(true);
    Animated.timing(opacity, {
      toValue: isOffline ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isOffline) setMounted(false);
    });
  }, [isOffline, opacity]);

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, dark ? styles.wrapDark : null, { top: insets.top + 6, opacity }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={14} color="#FFFFFF" />
      <Text style={styles.text} maxFontSizeMultiplier={1.2} numberOfLines={1}>
        You’re offline. We’ll send things once you’re back.
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 1000,
    elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.chip,
    backgroundColor: 'rgba(28,25,23,0.88)',
  },
  wrapDark: {
    backgroundColor: 'rgba(46,42,38,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: type.footnote.fontSize,
    fontWeight: '600',
  },
});
