import React from 'react';
import { View, Text, ViewStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import tw from '../../lib/tw';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<Size, { box: string; text: string }> = {
  xs: { box: 'w-7 h-7', text: 'text-[10px]' },
  sm: { box: 'w-9 h-9', text: 'text-xs' },
  md: { box: 'w-11 h-11', text: 'text-sm' },
  lg: { box: 'w-16 h-16', text: 'text-lg' },
  xl: { box: 'w-24 h-24', text: 'text-2xl' },
};

type Props = {
  uri?: string | null;
  name?: string;
  size?: Size;
  style?: StyleProp<ViewStyle>;
  ring?: boolean;
};

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({ uri, name, size = 'md', style, ring = false }: Props) {
  const { box, text } = SIZE_MAP[size];

  return (
    <View
      style={[
        tw`${box} rounded-full overflow-hidden bg-brand-100 items-center justify-center ${
          ring ? 'border-2 border-brand-500' : 'border border-stone-200'
        }`,
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={tw`w-full h-full`} contentFit="cover" transition={150} />
      ) : (
        <Text style={tw`${text} font-semibold text-brand-700`}>{getInitials(name)}</Text>
      )}
    </View>
  );
}
