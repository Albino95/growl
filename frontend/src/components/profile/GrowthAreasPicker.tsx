import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CATEGORIES, { type Category } from '../../data/categories';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { alertMessage } from '../../utils/confirmDialog';
import tw from '../../lib/tw';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

  const selectedParentCount = useMemo(() => parentGroupCount(value), [value]);

  const toggleCategory = (categoryKey: string) => {
    if (value.includes(categoryKey)) {
      onChange(value.filter((k) => k !== categoryKey));
      return;
    }
    const withoutSubs = value.filter((k) => !k.startsWith(categoryKey + ':'));
    const otherParents = parentGroupCount(withoutSubs);
    if (otherParents >= MAX_CATEGORIES) {
      alertMessage('Limit reached', `You can select a maximum of ${MAX_CATEGORIES} growth areas`);
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
      alertMessage('Limit reached', `You can select a maximum of ${MAX_CATEGORIES} growth areas`);
      return;
    }
    const withoutCategory = value.filter((k) => k !== categoryKey);
    onChange([...withoutCategory, fullKey]);
  };

  const getSelectedSubcategories = (category: Category): string[] =>
    value.filter((k) => k.startsWith(category.key + ':')).map((k) => k.split(':')[1]);

  const isCategorySelected = (category: Category): boolean =>
    value.includes(category.key) || getSelectedSubcategories(category).length > 0;

  const expand = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCategory((prev) => (prev === key ? null : key));
  };

  const removePath = (path: string) => {
    onChange(value.filter((k) => k !== path));
  };

  return (
    <View style={[tw`flex-1`, { minHeight: 0 }]}>
      {showCountBanner ? (
        <View style={tw`mb-3 bg-[#EAE4D6] border border-stone-200/80 rounded-2xl px-4 py-3`}>
          <View style={tw`flex-row items-center justify-between`}>
            <View>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                Growth paths
              </Text>
              <Text style={tw`text-base font-bold text-stone-900 mt-0.5`}>
                {selectedParentCount} of {MAX_CATEGORIES} selected
              </Text>
            </View>
            {value.length > 0 ? (
              <TouchableOpacity
                onPress={() => onChange([])}
                style={tw`px-3 py-1.5 bg-white border border-stone-200 rounded-full`}
              >
                <Text style={tw`text-xs font-semibold text-emerald-700`}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {value.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={tw`mt-3`}
              contentContainerStyle={tw`pr-2`}
            >
              {value.map((path) => (
                <TouchableOpacity
                  key={path}
                  onPress={() => removePath(path)}
                  style={tw`flex-row items-center mr-2 px-3 py-1.5 rounded-full bg-emerald-600`}
                  accessibilityLabel={`Remove ${getCategoryLabel(path)}`}
                >
                  <Text style={tw`text-xs font-semibold text-white mr-1.5`} numberOfLines={1}>
                    {getCategoryLabel(path)}
                  </Text>
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={tw`text-xs text-stone-500 mt-2 leading-4`}>
              Tap a path, then choose All or specific focuses.
            </Text>
          )}
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
          const allSelected = value.includes(category.key);
          const icon = category.icon as keyof typeof Ionicons.glyphMap;

          return (
            <View
              key={category.key}
              style={tw`mb-2.5 overflow-hidden rounded-2xl border ${
                isSelected
                  ? 'border-emerald-500/40 bg-white'
                  : isExpanded
                    ? 'border-stone-300 bg-white'
                    : 'border-stone-200/80 bg-white'
              }`}
            >
              <TouchableOpacity
                onPress={() => expand(category.key)}
                style={tw`flex-row items-center px-3.5 py-3.5`}
                activeOpacity={0.75}
              >
                <View
                  style={tw`w-11 h-11 rounded-2xl items-center justify-center mr-3 ${
                    isSelected ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                  }`}
                >
                  <Ionicons name={icon} size={22} color={isSelected ? '#FFFFFF' : '#059669'} />
                </View>

                <View style={tw`flex-1 pr-2`}>
                  <Text
                    style={tw`text-[16px] font-bold ${
                      isSelected ? 'text-stone-900' : 'text-stone-800'
                    }`}
                  >
                    {category.label}
                  </Text>
                  <Text style={tw`text-xs text-stone-500 mt-0.5`} numberOfLines={1}>
                    {allSelected
                      ? `All ${category.label}`
                      : selectedSubs.length > 0
                        ? selectedSubs
                            .map(
                              (sk) =>
                                category.subcategories.find((s) => s.key === sk)?.label || sk
                            )
                            .join(' · ')
                        : `${category.subcategories.length} focuses`}
                  </Text>
                </View>

                {isSelected ? (
                  <View style={tw`w-7 h-7 rounded-full bg-emerald-100 items-center justify-center mr-2`}>
                    <Ionicons name="checkmark" size={16} color="#059669" />
                  </View>
                ) : null}

                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#A8A29E"
                />
              </TouchableOpacity>

              {isExpanded ? (
                <View style={tw`px-3 pb-3 pt-0`}>
                  <View style={tw`h-px bg-stone-100 mb-3`} />
                  <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-400 uppercase mb-2 px-0.5`}>
                    Choose focus
                  </Text>

                  <View style={tw`flex-row flex-wrap`}>
                    <TouchableOpacity
                      onPress={() => toggleCategory(category.key)}
                      style={tw`mr-2 mb-2 px-3.5 py-2 rounded-full border flex-row items-center ${
                        allSelected
                          ? 'bg-emerald-600 border-emerald-600'
                          : 'bg-[#F3EEE4] border-stone-200'
                      }`}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="apps-outline"
                        size={14}
                        color={allSelected ? '#FFFFFF' : '#57534E'}
                        style={tw`mr-1.5`}
                      />
                      <Text
                        style={tw`text-sm font-semibold ${
                          allSelected ? 'text-white' : 'text-stone-700'
                        }`}
                      >
                        All
                      </Text>
                    </TouchableOpacity>

                    {category.subcategories.map((sub) => {
                      const subKey = `${category.key}:${sub.key}`;
                      const isSubSelected = value.includes(subKey);
                      return (
                        <TouchableOpacity
                          key={sub.key}
                          onPress={() => toggleSubcategory(category.key, sub.key)}
                          style={tw`mr-2 mb-2 px-3.5 py-2 rounded-full border ${
                            isSubSelected
                              ? 'bg-emerald-600 border-emerald-600'
                              : 'bg-[#F3EEE4] border-stone-200'
                          }`}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={tw`text-sm font-semibold ${
                              isSubSelected ? 'text-white' : 'text-stone-700'
                            }`}
                          >
                            {sub.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
