import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getUnreadMessageCount } from '../../services/api/messages';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';

/** Compact messages chrome control with coral unread badge. */
export default function MessagesInboxButton() {
  const navigation = useNavigation();
  const [count, setCount] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (count <= 0) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 720, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 720, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [count, pulse]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getUnreadMessageCount()
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
      return () => {
        cancelled = true;
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
          <Text style={tw`text-[9px] font-bold text-white`}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
