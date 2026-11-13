import React, { useRef, useState } from 'react';
import { View, Text, Image, Pressable, Animated, StyleProp, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';
import { duration, spring, timing } from '../../theme/motion';
import { getReducedMotion } from '../../hooks/useReducedMotion';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { useHomeTabStore } from '../../state/useHomeTabStore';
import SeedSmileBurst from './SeedSmileBurst';

type Props = {
  /** Actions on the right (inbox, shop, compose, etc.) */
  right?: React.ReactNode;
  /** Optional control before the Grow! mark (e.g. back) */
  leftAccessory?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Compact top chrome — Grow! mark + wordmark + optional actions.
 * Tap the mark seven times for a quiet easter egg.
 */
export default function GrowChromeHeader({ right, leftAccessory, style }: Props) {
  const navigation = useNavigation();
  const requestHome = useHomeTabStore((s) => s.requestTopAndRefresh);
  const [eggKey, setEggKey] = useState(0);
  const [hint, setHint] = useState('');
  const taps = useRef({ n: 0, at: 0 });
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const bounce = () => {
    if (getReducedMotion()) return;
    Animated.sequence([spring(scale, 0.86, 'snappy'), spring(scale, 1, 'bouncy')]).start();
  };

  const goHome = () => {
    bounce();
    // Plain navigation: silent until the 7-tap egg fires (celebrate below).
    navigateFromRoot(navigation, 'Individual', { screen: 'Feed' });
    requestHome();
  };

  const onMarkPress = () => {
    const now = Date.now();
    if (now - taps.current.at > 4200) taps.current.n = 0;
    taps.current.at = now;
    taps.current.n += 1;
    goHome();
    if (taps.current.n >= 7) {
      taps.current.n = 0;
      feedback.celebrate();
      setEggKey((k) => k + 1);
      setHint('Still growing.');
      setTimeout(() => setHint(''), 2200);
    }
  };

  const onMarkLong = () => {
    feedback.egg();
    if (!getReducedMotion()) {
      Animated.sequence([
        timing(rotate, 1, { duration: duration.quick }),
        spring(rotate, 0, 'bouncy'),
      ]).start();
    }
    setHint('Hi.');
    setTimeout(() => setHint(''), 1100);
  };

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-18deg'] });

  return (
    <View
      style={[
        tw`px-4 py-2.5 flex-row items-center justify-between bg-surface-page border-b border-stone-200/50`,
        style,
      ]}
    >
      <View style={tw`flex-row items-center flex-1 pr-2`}>
        {leftAccessory ? <View style={tw`mr-2`}>{leftAccessory}</View> : null}
        <Pressable
          onPress={onMarkPress}
          onLongPress={onMarkLong}
          delayLongPress={380}
          hitSlop={8}
          accessibilityLabel="Grow!"
        >
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              transform: [{ scale }, { rotate: spin }],
            }}
          >
            <View style={{ width: 26, height: 26, marginRight: 8 }}>
              <Image
                source={require('../../../assets/icon.png')}
                style={{ width: 26, height: 26, borderRadius: 7 }}
              />
              <SeedSmileBurst triggerKey={eggKey} />
            </View>
            <Text style={tw`text-[15px] tracking-[2.5px] uppercase text-emerald-700 font-bold`}>
              Grow!
            </Text>
          </Animated.View>
        </Pressable>
        {hint ? (
          <Text style={tw`ml-2 text-[11px] font-semibold text-emerald-700`}>{hint}</Text>
        ) : null}
      </View>
      {right ? <View style={tw`flex-row items-center gap-2`}>{right}</View> : null}
    </View>
  );
}
