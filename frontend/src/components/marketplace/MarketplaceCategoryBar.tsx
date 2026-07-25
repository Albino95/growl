import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { horizontalScrollProps } from '../../constants/scroll';
import CATEGORIES, { type Category } from '../../data/categories';

type Props = {
  categoryKeys: string[];
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  counts: Record<string, number>;
  subcategoryCounts: Record<string, number>;
  onSelectCategory: (category: string | null) => void;
  onSelectSubcategory: (subcategory: string | null) => void;
  totalCount: number;
};

function Chip({
  label,
  icon,
  count,
  selected,
  onPress,
  compact,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={tw`mr-2 ${compact ? 'min-h-[36px] px-3.5' : 'min-h-[44px] px-3.5'} rounded-2xl flex-row items-center border ${
        selected
          ? 'bg-emerald-600 border-emerald-600'
          : 'bg-white border-stone-200'
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
          <Text
            style={tw`text-[11px] font-bold ${selected ? 'text-white' : 'text-stone-600'}`}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function MarketplaceCategoryBar({
  categoryKeys,
  selectedCategory,
  selectedSubcategory,
  counts,
  subcategoryCounts,
  onSelectCategory,
  onSelectSubcategory,
  totalCount,
}: Props) {
  const selectedMeta: Category | undefined = CATEGORIES.find((c) => c.key === selectedCategory);

  return (
    <View style={tw`bg-white border-b border-stone-100`}>
      <View style={{ height: 56, justifyContent: 'center' }}>
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          contentContainerStyle={tw`px-4 items-center`}
          {...horizontalScrollProps}
        >
          <Chip
            label="All"
            icon="grid-outline"
            count={totalCount}
            selected={selectedCategory === null}
            onPress={() => onSelectCategory(null)}
          />
          {categoryKeys.map((key) => {
            const meta = CATEGORIES.find((c) => c.key === key);
            const label = meta?.label || key;
            const icon = (meta?.icon || 'ellipse-outline') as keyof typeof Ionicons.glyphMap;
            return (
              <Chip
                key={key}
                label={label}
                icon={icon}
                count={counts[key] ?? 0}
                selected={selectedCategory === key}
                onPress={() => onSelectCategory(key)}
              />
            );
          })}
        </ScrollView>
      </View>

      {selectedMeta && selectedMeta.subcategories.length > 0 ? (
        <View style={{ height: 48, justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            contentContainerStyle={tw`px-4 items-center`}
            {...horizontalScrollProps}
          >
            <Chip
              compact
              label="All"
              count={counts[selectedMeta.key] ?? 0}
              selected={selectedSubcategory === null}
              onPress={() => onSelectSubcategory(null)}
            />
            {selectedMeta.subcategories.map((sub) => (
              <Chip
                key={sub.key}
                compact
                label={sub.label}
                count={subcategoryCounts[sub.key] ?? 0}
                selected={selectedSubcategory === sub.key}
                onPress={() => onSelectSubcategory(sub.key)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
