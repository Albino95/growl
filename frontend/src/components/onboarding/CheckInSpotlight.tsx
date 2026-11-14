import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import { radius, spacing } from '../../theme/tokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useDemoTutorialStore } from '../../state/useDemoTutorialStore';

/**
 * Wraps Home's Today card. When the tour hands off ("Check in now"), a soft brand
 * ring pulses around the card twice. Reduced motion: one calm fade in/out, no scale.
 * Purely decorative — pointerEvents none, never blocks the mood buttons.
 */
export default function CheckInSpotlight({ children }: { children: React.ReactNode }) {
  const request = useDemoTutorialStore((s) => s.checkInSpotlight);
  const seenRequest = useRef(request);
  const ring = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  // The Today card renders nothing until growth data loads — no ring around an empty box.
  const [hasCard, setHasCard] = useState(false);

  useEffect(() => {
    if (request === seenRequest.current) return;
    seenRequest.current = request;
    ring.stopAnimation();
    ring.setValue(0);
    const fade = (to: number, ms: number, delay = 0) =>
      Animated.timing(ring, { toValue: to, duration: ms, delay, useNativeDriver: true });
    const anim = reduced
      ? Animated.sequence([fade(1, 150, 350), fade(1, 2200), fade(0, 400)])
      : Animated.sequence([
          // Wait for the tour overlay to clear and the list to scroll up.
          fade(1, 380, 450),
          fade(0.35, 420),
          fade(1, 420),
          fade(0.35, 420),
          fade(1, 420),
          fade(0, 700, 900),
        ]);
    anim.start();
    AccessibilityInfo.announceForAccessibility?.('Tap how you feel to check in for today.');
    return () => anim.stop();
  }, [request, ring, reduced]);

  const scale = ring.interpolate({
    inputRange: [0, 1],
    outputRange: reduced ? [1, 1] : [0.985, 1],
  });

  return (
    <View onLayout={(e) => setHasCard(e.nativeEvent.layout.height > 24)}>
      {children}
      {hasCard ? (
        <Animated.View
          pointerEvents="none"
          style={[
            tw`absolute`,
            {
              top: -3,
              bottom: 12 - 3,
              left: spacing.gutter - 3,
              right: spacing.gutter - 3,
              borderRadius: radius.sheet + 3,
              borderWidth: 2,
              borderColor: theme.colors.brand,
              opacity: ring,
              transform: [{ scale }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}
