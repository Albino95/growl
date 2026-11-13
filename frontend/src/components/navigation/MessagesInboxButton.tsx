import React, { useCallback, useState } from 'react';
import { View, Text, Animated, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getUnreadMessageCount } from '../../services/api/messages';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { isAppActive } from '../../utils/appActive';
import { useUnreadPulse } from '../../hooks/useUnreadPulse';

const BADGE_REFRESH_MS = 60_000;

/** Compact messages chrome control with coral unread badge. */
export default function MessagesInboxButton() {
  const navigation = useNavigation();
  const [count, setCount] = useState(0);
  const pulse = useUnreadPulse(count, 'messages');

  // Refresh on focus, when the app returns to the foreground, and every 60s
  // while this screen is focused (blurred tab screens stay mounted; they don't poll).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const refresh = (force = false) => {
        if (!force && !isAppActive()) return;
        void getUnreadMessageCount()
          .then((n) => {
            if (!cancelled) setCount(n);
          })
          .catch(() => undefined);
      };
      refresh(true);
      const interval = setInterval(() => refresh(), BADGE_REFRESH_MS);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh(true);
      });
      return () => {
        cancelled = true;
        clearInterval(interval);
        sub.remove();
      };
    }, [])
  );

  return (
    <PressableScale
      onPress={() => navigateFromRoot(navigation, 'Messages')}
      feedback="open"
      style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
      accessibilityLabel={count > 0 ? `Messages, ${count} unread` : 'Messages'}
    >
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Ionicons
          name={count > 0 ? 'chatbubbles' : 'chatbubbles-outline'}
          size={17}
          color="#059669"
        />
      </Animated.View>
      {count > 0 ? (
        <View
          style={tw`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-energy-600 items-center justify-center border-2 border-[#F3EEE4]`}
        >
          <Text maxFontSizeMultiplier={1.3} style={tw`text-[11px] font-bold text-white`}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
