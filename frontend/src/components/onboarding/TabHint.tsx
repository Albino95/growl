import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { spring } from '../../theme/motion';
import { haptic } from '../../theme/haptics';
import type { TabHintKey } from '../../state/useDemoTutorialStore';

export const TAB_HINTS: Record<
  TabHintKey,
  { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }
> = {
  Explore: {
    icon: 'compass-outline',
    title: 'Explore',
    body: 'Meet people growing the same things as you. Tap Add on anyone who clicks.',
  },
  Journal: {
    icon: 'lock-closed-outline',
    title: 'Journal',
    body: 'Private by default. Share an entry with your circle only if you choose.',
  },
  Marketplace: {
    icon: 'storefront-outline',
    title: 'Shop',
    body: 'Tools and goods for what you’re growing. Your orders live in Settings.',
  },
  Profile: {
    icon: 'person-outline',
    title: 'You',
    body: 'Your profile, friends and paths. Change what you’re growing in anytime.',
  },
};

type Props = {
  hintKey: TabHintKey;
  onDismiss: () => void;
};

/**
 * One-time, one-sentence card above the dock the first time a tab is opened.
 * Pointer events only on the card itself so the screen underneath stays usable.
 */
export default function TabHint({ hintKey, onDismiss }: Props) {
  const hint = TAB_HINTS[hintKey];
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    // Reduced motion: a short opacity fade only (translate is pinned to 0 below).
    spring(enter, 1, 'gentle', reduced).start();
    AccessibilityInfo.announceForAccessibility?.(`${hint.title} tip. ${hint.body}`);
  }, [hintKey, enter, reduced, hint.title, hint.body]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: reduced ? [0, 0] : [12, 0],
  });

  return (
    <Animated.View
      style={[
        tw`flex-row items-start rounded-card px-3.5 py-3 border`,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.line,
          opacity: enter,
          transform: [{ translateY }],
          shadowColor: '#1C1917',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.1,
          shadowRadius: 14,
          elevation: 8,
        },
      ]}
      accessibilityRole="alert"
    >
      <View
        style={[
          tw`w-8 h-8 rounded-full items-center justify-center mr-3`,
          { backgroundColor: theme.colors.brandSoft },
        ]}
      >
        <Ionicons name={hint.icon} size={16} color={theme.colors.brand} />
      </View>
      <View style={tw`flex-1 pr-2`}>
        <Text style={tw`text-footnote font-semibold text-ink`}>{hint.title}</Text>
        <Text style={tw`text-footnote text-ink-2 mt-0.5`}>{hint.body}</Text>
      </View>
      <PressableScale
        onPress={() => {
          haptic('selection');
          onDismiss();
        }}
        hitSlop={10}
        pressedScale={0.9}
        accessibilityRole="button"
        accessibilityLabel="Got it, dismiss tip"
        style={tw`px-2.5 py-1.5 rounded-chip bg-raised`}
      >
        <Text style={tw`text-footnote font-semibold text-ink-2`}>Got it</Text>
      </PressableScale>
    </Animated.View>
  );
}
