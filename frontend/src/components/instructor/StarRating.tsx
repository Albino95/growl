import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

export function StarRow({
  value,
  size = 14,
  color = '#D97706',
}: {
  value: number;
  size?: number;
  color?: string;
}) {
  const rounded = Math.round(value);
  return (
    <View style={tw`flex-row items-center`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={n <= rounded ? color : (tw.color('stone-300') ?? '#D6D3D1')}
        />
      ))}
    </View>
  );
}

export function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
}) {
  return (
    <View style={tw`mb-3`}>
      {label ? (
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1.5`}>
          {label}
        </Text>
      ) : null}
      <View style={tw`flex-row`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <PressableScale
            key={n}
            onPress={() => onChange(n)}
            feedback="select"
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            accessibilityState={{ selected: n === value }}
            style={tw`mr-1.5`}
          >
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={28}
              color={n <= value ? '#D97706' : (tw.color('stone-300') ?? '#D6D3D1')}
            />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
