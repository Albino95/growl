import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CATEGORIES, { type Category } from '../../data/categories';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { alertMessage } from '../../utils/confirmDialog';
import tw from '../../lib/tw';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const MAX_GROWTH_PATHS = 3;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** When false, omit the selected count banner (parent can render its own). */
  showCountBanner?: boolean;
};

function parentKeyOf(path: string): string {
  return path.includes(':') ? path.split(':')[0] : path;
}

/** Unique parent growth areas (max 3). */
export function growthParentCount(keys: string[]): number {
  return new Set(keys.map(parentKeyOf)).size;
}

/** Keep at most one entry per parent, then at most MAX_GROWTH_PATHS parents. */
export function clampGrowthPaths(keys: string[], max = MAX_GROWTH_PATHS): string[] {
  const byParent = new Map<string, string>();
  for (const key of keys) {
    const parent = parentKeyOf(key);
    if (!byParent.has(parent)) {
      byParent.set(parent, key);
    }
  }
  return Array.from(byParent.values()).slice(0, max);
}

/**
 * Shared growth-area picker: expand parent → pick "All" or one focus as `parent:sub`.
 * Hard limit: 3 parent paths (not 3 chips of mixed subcategories).
 */
export default function GrowthAreasPicker({ value, onChange, showCountBanner = true }: Props) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Normalize: one entry per parent, max 3 — fixes legacy multi-sub selections over the limit
  const normalized = useMemo(() => clampGrowthPaths(value), [value]);
  const selectedParentCount = growthParentCount(normalized);

  useEffect(() => {
    const clamped = clampGrowthPaths(value);
    const same =
      clamped.length === value.length && clamped.every((k, i) => k === value[i]);
    if (!same) {
      onChange(clamped);
    }
    // Intentionally key off serialized value to avoid onChange identity loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join('|')]);

  const commit = (next: string[]) => {
    onChange(clampGrowthPaths(next));
  };

  const toggleCategory = (categoryKey: string) => {
    if (normalized.includes(categoryKey)) {
      commit(normalized.filter((k) => k !== categoryKey));
      return;
    }
    const withoutParent = normalized.filter((k) => parentKeyOf(k) !== categoryKey);
    if (growthParentCount(withoutParent) >= MAX_GROWTH_PATHS) {
      alertMessage('Limit reached', `You can select a maximum of ${MAX_GROWTH_PATHS} growth paths`);
      return;
    }
    commit([...withoutParent, categoryKey]);
  };

  const toggleSubcategory = (categoryKey: string, subcategoryKey: string) => {
    const fullKey = `${categoryKey}:${subcategoryKey}`;
    if (normalized.includes(fullKey)) {
      commit(normalized.filter((k) => k !== fullKey));
      return;
    }
    const withoutParent = normalized.filter((k) => parentKeyOf(k) !== categoryKey);
    // One focus per parent: replace any existing selection for this path
    if (growthParentCount(withoutParent) >= MAX_GROWTH_PATHS) {
      alertMessage('Limit reached', `You can select a maximum of ${MAX_GROWTH_PATHS} growth paths`);
      return;
    }
    commit([...withoutParent, fullKey]);
  };

  const getSelectedSubcategories = (category: Category): string[] =>
    normalized.filter((k) => k.startsWith(category.key + ':')).map((k) => k.split(':')[1]);

  const isCategorySelected = (category: Category): boolean =>
    normalized.some((k) => parentKeyOf(k) === category.key);

  const expand = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCategory((prev) => (prev === key ? null : key));
  };

  const removePath = (path: string) => {
    commit(normalized.filter((k) => k !== path));
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
                {selectedParentCount} of {MAX_GROWTH_PATHS} selected
              </Text>
            </View>
            {normalized.length > 0 ? (
              <TouchableOpacity
                onPress={() => commit([])}
                style={tw`px-3 py-1.5 bg-white border border-stone-200 rounded-full`}
              >
                <Text style={tw`text-xs font-semibold text-emerald-700`}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {normalized.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={tw`mt-3`}
              contentContainerStyle={tw`pr-2`}
            >
              {normalized.map((path) => (
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
              Tap a path, then choose All or one focus. Max {MAX_GROWTH_PATHS}.
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
          const allSelected = normalized.includes(category.key);
          const icon = category.icon as keyof typeof Ionicons.glyphMap;
          const atLimit = selectedParentCount >= MAX_GROWTH_PATHS && !isSelected;

          return (
            <View
              key={category.key}
              style={tw`mb-2.5 overflow-hidden rounded-2xl border ${
                isSelected
                  ? 'border-emerald-500/40 bg-white'
                  : isExpanded
                    ? 'border-stone-300 bg-white'
                    : 'border-stone-200/80 bg-white'
              } ${atLimit ? 'opacity-55' : ''}`}
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
                        ? category.subcategories.find((s) => s.key === selectedSubs[0])?.label ||
                          selectedSubs[0]
                        : atLimit
                          ? 'Limit reached'
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
                      disabled={atLimit}
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
                      const isSubSelected = normalized.includes(subKey);
                      return (
                        <TouchableOpacity
                          key={sub.key}
                          onPress={() => toggleSubcategory(category.key, sub.key)}
                          disabled={atLimit && !isSubSelected}
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
