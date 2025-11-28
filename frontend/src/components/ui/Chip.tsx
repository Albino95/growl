import React from 'react';
import { Pressable, Text } from 'react-native';
import tw from '../../lib/tw';

type Props = { selected?: boolean; onPress?: () => void; children: React.ReactNode; };

export default function Chip({ selected, onPress, children }: Props) {
  return (
    <Pressable onPress={onPress} style={tw`${selected ? 'bg-green-600' : 'bg-gray-100'} px-3 py-2 rounded-full mr-2 mb-2`}>
      <Text style={tw`${selected ? 'text-white' : 'text-gray-700'}`}>{children}</Text>
    </Pressable>
  );
}
