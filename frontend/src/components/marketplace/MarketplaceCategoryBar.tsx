import React from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { horizontalScrollProps } from '../../constants/scroll';
import CATEGORIES, { type Category } from '../../data/categories';
import { CategoryCapsule } from '../ui/CategoryCapsule';

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
    <View style={tw`bg-transparent`}>
      <View style={{ height: 56, justifyContent: 'center' }}>
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          contentContainerStyle={tw`px-5 items-center`}
          {...horizontalScrollProps}
        >
          <CategoryCapsule
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
              <CategoryCapsule
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
        <View style={{ height: 48, justifyContent: 'center', backgroundColor: '#EAE4D6' }}>
          <ScrollView
            horizontal
            style={{ flexGrow: 0 }}
            contentContainerStyle={tw`px-4 items-center`}
            {...horizontalScrollProps}
          >
            <CategoryCapsule
              compact
              label="All"
              count={counts[selectedMeta.key] ?? 0}
              selected={selectedSubcategory === null}
              onPress={() => onSelectSubcategory(null)}
            />
            {selectedMeta.subcategories.map((sub) => (
              <CategoryCapsule
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
