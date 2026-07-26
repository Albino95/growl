import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { horizontalScrollProps } from '../../constants/scroll';

export type CapsuleItem = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
};

type CapsuleProps = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
};

/** Marketplace-style category capsule used across Shop + Explore. */
export function CategoryCapsule({
  label,
  icon,
  count,
  selected,
  onPress,
  compact,
}: CapsuleProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={tw`mr-2 ${compact ? 'min-h-[36px] px-3.5' : 'min-h-[44px] px-3.5'} rounded-2xl flex-row items-center border ${
        selected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-stone-200'
      }`}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={compact ? 16 : 18}
          color={selected ? '#FFFFFF' : '#059669'}
          style={tw`mr-1.5`}
        />
      ) : null}
      <Text
        style={tw`font-semibold ${compact ? 'text-sm' : 'text-[15px]'} ${
          selected ? 'text-white' : 'text-stone-800'
        }`}
      >
        {label}
      </Text>
      {typeof count === 'number' ? (
        <View
          style={tw`ml-2 min-w-[22px] h-[22px] px-1.5 rounded-full items-center justify-center ${
            selected ? 'bg-white/20' : 'bg-stone-100'
          }`}
        >
          <Text style={tw`text-[11px] font-bold ${selected ? 'text-white' : 'text-stone-600'}`}>
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

type RowProps = {
  items: CapsuleItem[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  allLabel?: string;
  allCount?: number;
  /** When true, selecting the active chip again clears to All */
  allowDeselect?: boolean;
};

export function CategoryCapsuleRow({
  items,
  selectedKey,
  onSelect,
  allLabel = 'All',
  allCount,
  allowDeselect = true,
}: RowProps) {
  return (
    <View style={{ height: 56, justifyContent: 'center' }}>
      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        contentContainerStyle={tw`px-1 items-center`}
        {...horizontalScrollProps}
      >
        <CategoryCapsule
          label={allLabel}
          icon="grid-outline"
          count={allCount}
          selected={selectedKey === null}
          onPress={() => onSelect(null)}
        />
        {items.map((item) => (
          <CategoryCapsule
            key={item.key}
            label={item.label}
            icon={item.icon}
            count={item.count}
            selected={selectedKey === item.key}
            onPress={() =>
              onSelect(allowDeselect && selectedKey === item.key ? null : item.key)
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}
