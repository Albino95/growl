import React from 'react';
import { Pressable, Text, Animated } from 'react-native';
import tw from '../../lib/tw';
import { usePressFeedback } from '../../hooks/usePressFeedback';

type Props = {
  selected?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  tone?: 'brand' | 'accent' | 'neutral';
};

function Chip({ selected, onPress, children, tone = 'brand' }: Props) {
  const feedback = usePressFeedback({ onPress });
  const selectedClass = tone === 'accent' ? 'bg-accent-600 border-accent-600' : 'bg-brand-600 border-brand-600';
  const unselectedClass = 'bg-stone-100 border-stone-200';
  return (
    <Pressable
      onPress={feedback.onPress}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      style={tw`${selected ? selectedClass : unselectedClass} px-3.5 py-2 rounded-full mr-2 mb-2 border`}
    >
      <Animated.View style={feedback.animatedStyle}>
        <Text style={tw`text-sm font-medium ${selected ? 'text-white' : 'text-stone-700'}`}>
          {children}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default React.memo(Chip);
