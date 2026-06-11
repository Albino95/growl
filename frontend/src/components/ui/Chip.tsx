import React from 'react';
import { Pressable, Text } from 'react-native';
import tw from '../../lib/tw';

type Props = {
  selected?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  tone?: 'brand' | 'accent' | 'neutral';
};

export default function Chip({ selected, onPress, children, tone = 'brand' }: Props) {
  const selectedClass = tone === 'accent' ? 'bg-accent-600 border-accent-600' : 'bg-brand-600 border-brand-600';
  const unselectedClass = 'bg-stone-100 border-stone-200';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
      style={tw`${selected ? selectedClass : unselectedClass} px-3.5 py-2 rounded-full mr-2 mb-2 border`}
    >
      <Text style={tw`text-sm font-medium ${selected ? 'text-white' : 'text-stone-700'}`}>{children}</Text>
    </Pressable>
  );
}
