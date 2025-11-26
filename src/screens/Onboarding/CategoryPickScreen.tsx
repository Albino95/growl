import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Chip from '../../components/ui/Chip';
import PrimaryButton from '../../components/ui/PrimaryButton';
import CATEGORIES, { Category, Subcategory } from '../../data/categories';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

export default function CategoryPickScreen({ navigation }: any) {
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null);
  const { setOnboardingComplete } = useAuthStore();

  const toggleCategory = (categoryKey: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(categoryKey)) {
        return prev.filter((k) => k !== categoryKey);
      } else if (prev.length < 3) {
        return [...prev, categoryKey];
      } else {
        alert('You can select a maximum of 3 categories');
        return prev;
      }
    });
  };

  const toggleSubcategory = (categoryKey: string, subcategoryKey: string) => {
    const fullKey = `${categoryKey}:${subcategoryKey}`;
    setSelectedCategories((prev) => {
      const categorySelected = prev.includes(categoryKey);
      const otherCategories = prev.filter((k) => !k.startsWith(categoryKey + ':') && k !== categoryKey);
      
      if (prev.includes(fullKey)) {
        // Remove subcategory
        const remaining = prev.filter((k) => k !== fullKey);
        // If no subcategories left for this category, remove category too
        const hasOtherSubs = remaining.some((k) => k.startsWith(categoryKey + ':'));
        return hasOtherSubs ? remaining : otherCategories;
      } else {
        // Add subcategory
        if (otherCategories.length >= 3) {
          alert('You can select a maximum of 3 categories');
          return prev;
        }
        // Remove category if it was selected (replace with subcategory)
        const withoutCategory = prev.filter((k) => k !== categoryKey);
        return [...withoutCategory, fullKey];
      }
    });
  };

  const handleContinue = () => {
    if (selectedCategories.length === 0) {
      alert('Please select at least one category to continue');
      return;
    }
    setOnboardingComplete(selectedCategories);
    navigation.replace('Individual');
  };

  const getSelectedSubcategories = (category: Category): string[] => {
    return selectedCategories
      .filter((k) => k.startsWith(category.key + ':'))
      .map((k) => k.split(':')[1]);
  };

  const isCategorySelected = (category: Category): boolean => {
    return selectedCategories.includes(category.key) || getSelectedSubcategories(category).length > 0;
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`p-6 flex-1`}>
        <View style={tw`mb-6`}>
          <Text style={tw`text-3xl font-bold mb-2 text-green-600`}>Choose Your Growth Areas</Text>
          <Text style={tw`text-base text-gray-600`}>
            Select up to 3 categories where you want to grow. This helps us personalize your feed.
          </Text>
          <Text style={tw`text-sm text-gray-500 mt-2`}>
            Selected: {selectedCategories.length}/3
          </Text>
        </View>

        <ScrollView style={tw`flex-1 mb-6`} showsVerticalScrollIndicator={false}>
          {CATEGORIES.map((category) => {
            const isSelected = isCategorySelected(category);
            const isExpanded = expandedCategory === category.key;
            const selectedSubs = getSelectedSubcategories(category);

            return (
              <View key={category.key} style={tw`mb-4`}>
                <TouchableOpacity
                  onPress={() => setExpandedCategory(isExpanded ? null : category.key)}
                  style={tw`flex-row items-center justify-between p-4 rounded-xl border-2 ${
                    isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <View style={tw`flex-row items-center flex-1`}>
                    <Ionicons
                      name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={20}
                      color={isSelected ? '#10B981' : '#6B7280'}
                      style={tw`mr-3`}
                    />
                    <Text style={tw`text-lg font-semibold ${isSelected ? 'text-green-700' : 'text-gray-800'}`}>
                      {category.label}
                    </Text>
                    {selectedSubs.length > 0 && (
                      <Text style={tw`text-sm text-green-600 ml-2`}>
                        ({selectedSubs.length} selected)
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={tw`mt-2 ml-4 pl-4 border-l-2 border-gray-200`}>
                    <TouchableOpacity
                      onPress={() => toggleCategory(category.key)}
                      style={tw`mb-2 p-2 rounded-lg ${
                        selectedCategories.includes(category.key) ? 'bg-green-100' : 'bg-gray-50'
                      }`}
                    >
                      <Text style={tw`text-sm font-medium ${
                        selectedCategories.includes(category.key) ? 'text-green-700' : 'text-gray-600'
                      }`}>
                        All {category.label}
                      </Text>
                    </TouchableOpacity>
                    {category.subcategories.map((sub) => {
                      const subKey = `${category.key}:${sub.key}`;
                      const isSubSelected = selectedCategories.includes(subKey);
                      return (
                        <TouchableOpacity
                          key={sub.key}
                          onPress={() => toggleSubcategory(category.key, sub.key)}
                          style={tw`mb-2 p-2 rounded-lg ${
                            isSubSelected ? 'bg-green-100' : 'bg-gray-50'
                          }`}
                        >
                          <Text style={tw`text-sm ${
                            isSubSelected ? 'text-green-700 font-semibold' : 'text-gray-600'
                          }`}>
                            {sub.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <PrimaryButton
          label="Continue"
          onPress={handleContinue}
          disabled={selectedCategories.length === 0}
        />
      </View>
    </SafeAreaView>
  );
}
