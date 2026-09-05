import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import type { FilterCategory } from './types';

type CatMeta = {
  id: FilterCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent dot + active ring */
  accent: string;
};

export const FILTER_CATEGORY_META: CatMeta[] = [
  { id: 'natural', label: 'Natural', icon: 'leaf-outline', accent: '#34D399' },
  { id: 'portrait', label: 'Portrait', icon: 'person-outline', accent: '#F472B6' },
  { id: 'film', label: 'Film', icon: 'film-outline', accent: '#FBBF24' },
  { id: 'moody', label: 'Moody', icon: 'moon-outline', accent: '#818CF8' },
  { id: 'bw', label: 'B&W', icon: 'contrast-outline', accent: '#E7E5E4' },
  { id: 'social', label: 'Social', icon: 'flash-outline', accent: '#FB7185' },
];

export default function FilterCategoryBar({
  active,
  onSelect,
}: {
  active: FilterCategory;
  onSelect: (id: FilterCategory) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tw`px-4 py-2 gap-2`}
    >
      {FILTER_CATEGORY_META.map((cat) => {
        const selected = active === cat.id;
        return (
          <Pressable
            key={cat.id}
            onPress={() => onSelect(cat.id)}
            style={[
              tw`flex-row items-center rounded-full px-3.5 py-2 mr-1 border`,
              selected
                ? { backgroundColor: `${cat.accent}22`, borderColor: cat.accent }
                : tw`bg-stone-800/90 border-stone-700`,
            ]}
          >
            <View
              style={[
                tw`w-2 h-2 rounded-full mr-2`,
                { backgroundColor: selected ? cat.accent : '#57534E' },
              ]}
            />
            <Ionicons
              name={cat.icon}
              size={14}
              color={selected ? cat.accent : '#A8A29E'}
              style={tw`mr-1.5`}
            />
            <Text
              style={[
                tw`text-xs font-bold tracking-wide`,
                { color: selected ? cat.accent : '#D6D3D1' },
              ]}
            >
              {cat.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
