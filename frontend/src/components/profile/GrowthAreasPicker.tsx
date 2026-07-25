import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CATEGORIES, { type Category } from '../../data/categories';
import { alertMessage } from '../../utils/confirmDialog';
import tw from '../../lib/tw';

const MAX_CATEGORIES = 3;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** When false, omit the selected count banner (parent can render its own). */
  showCountBanner?: boolean;
};

/**
 * Shared growth-area picker: expand parent → pick "All" or subcategories as `parent:sub` paths.
 * Max 3 selections (parent keys or parent:sub paths count toward the limit by parent group).
 */
export default function GrowthAreasPicker({ value, onChange, showCountBanner = true }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const parentGroupCount = (keys: string[]) => {
    const parents = new Set(keys.map((k) => (k.includes(':') ? k.split(':')[0] : k)));
    return parents.size;
  };

  const toggleCategory = (categoryKey: string) => {
    if (value.includes(categoryKey)) {
      onChange(value.filter((k) => k !== categoryKey));
      return;
    }
    const withoutSubs = value.filter((k) => !k.startsWith(categoryKey + ':'));
    const otherParents = parentGroupCount(withoutSubs);
    if (otherParents >= MAX_CATEGORIES) {
      alertMessage('Limit reached', `You can select a maximum of ${MAX_CATEGORIES} categories`);
      return;
    }
    onChange([...withoutSubs, categoryKey]);
  };

  const toggleSubcategory = (categoryKey: string, subcategoryKey: string) => {
    const fullKey = `${categoryKey}:${subcategoryKey}`;
    const otherCategories = value.filter((k) => !k.startsWith(categoryKey + ':') && k !== categoryKey);

    if (value.includes(fullKey)) {
      const remaining = value.filter((k) => k !== fullKey);
      const hasOtherSubs = remaining.some((k) => k.startsWith(categoryKey + ':'));
      onChange(hasOtherSubs ? remaining : otherCategories);
      return;
    }

    if (parentGroupCount(otherCategories) >= MAX_CATEGORIES) {
      alertMessage('Limit reached', `You can select a maximum of ${MAX_CATEGORIES} categories`);
      return;
    }
    const withoutCategory = value.filter((k) => k !== categoryKey);
    onChange([...withoutCategory, fullKey]);
  };

  const getSelectedSubcategories = (category: Category): string[] =>
    value.filter((k) => k.startsWith(category.key + ':')).map((k) => k.split(':')[1]);

  const isCategorySelected = (category: Category): boolean =>
    value.includes(category.key) || getSelectedSubcategories(category).length > 0;

  return (
    <View style={[tw`flex-1`, { minHeight: 0 }]}>
      {showCountBanner ? (
        <View style={tw`mb-3 flex-row items-center justify-between bg-brand-50 rounded-xl px-4 py-3`}>
          <Text style={tw`text-sm font-semibold text-brand-800`}>
            Selected: {value.length}/{MAX_CATEGORIES}
          </Text>
          {value.length > 0 ? (
            <TouchableOpacity onPress={() => onChange([])} style={tw`px-3 py-1 bg-white rounded-full`}>
              <Text style={tw`text-xs font-semibold text-brand-700`}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={[tw`flex-1`, { minHeight: 0 }]}
        contentContainerStyle={tw`pb-4`}
        showsVerticalScrollIndicator
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORIES.map((category) => {
          const isSelected = isCategorySelected(category);
          const isExpanded = expandedCategory === category.key;
          const selectedSubs = getSelectedSubcategories(category);

          return (
            <View key={category.key} style={tw`mb-3`}>
              <TouchableOpacity
                onPress={() => setExpandedCategory(isExpanded ? null : category.key)}
                style={tw`flex-row items-center justify-between p-4 rounded-2xl border-2 ${
                  isSelected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'
                }`}
                activeOpacity={0.7}
              >
                <View style={tw`flex-row items-center flex-1`}>
                  <View
                    style={tw`w-10 h-10 rounded-full ${
                      isSelected ? 'bg-brand-600' : 'bg-stone-100'
                    } items-center justify-center mr-3`}
                  >
                    <Ionicons
                      name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={20}
                      color={isSelected ? '#FFFFFF' : '#6B7280'}
                    />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-lg font-bold ${isSelected ? 'text-brand-700' : 'text-stone-800'}`}>
                      {category.label}
                    </Text>
                    {selectedSubs.length > 0 ? (
                      <Text style={tw`text-sm text-brand-600 mt-0.5`}>
                        {selectedSubs.length} subcategor{selectedSubs.length === 1 ? 'y' : 'ies'} selected
                      </Text>
                    ) : null}
                  </View>
                </View>
                {isSelected ? (
                  <View style={tw`w-8 h-8 rounded-full bg-brand-600 items-center justify-center`}>
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  </View>
                ) : null}
              </TouchableOpacity>

              {isExpanded ? (
                <View style={tw`mt-2 ml-2 pl-4 border-l-2 border-brand-200`}>
                  <TouchableOpacity
                    onPress={() => toggleCategory(category.key)}
                    style={tw`mb-2 p-3 rounded-xl ${
                      value.includes(category.key)
                        ? 'bg-brand-100 border-2 border-brand-500'
                        : 'bg-stone-50 border-2 border-stone-200'
                    }`}
                    activeOpacity={0.7}
                  >
                    <View style={tw`flex-row items-center justify-between`}>
                      <Text
                        style={tw`text-sm font-semibold ${
                          value.includes(category.key) ? 'text-brand-700' : 'text-stone-600'
                        }`}
                      >
                        All {category.label}
                      </Text>
                      {value.includes(category.key) ? (
                        <View style={tw`w-5 h-5 rounded-full bg-brand-600 items-center justify-center`}>
                          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                  {category.subcategories.map((sub) => {
                    const subKey = `${category.key}:${sub.key}`;
                    const isSubSelected = value.includes(subKey);
                    return (
                      <TouchableOpacity
                        key={sub.key}
                        onPress={() => toggleSubcategory(category.key, sub.key)}
                        style={tw`mb-2 p-3 rounded-xl ${
                          isSubSelected
                            ? 'bg-brand-100 border-2 border-brand-500'
                            : 'bg-stone-50 border-2 border-stone-200'
                        }`}
                        activeOpacity={0.7}
                      >
                        <View style={tw`flex-row items-center justify-between`}>
                          <Text
                            style={tw`text-sm ${
                              isSubSelected ? 'text-brand-700 font-semibold' : 'text-stone-600'
                            }`}
                          >
                            {sub.label}
                          </Text>
                          {isSubSelected ? (
                            <View style={tw`w-5 h-5 rounded-full bg-brand-600 items-center justify-center`}>
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
