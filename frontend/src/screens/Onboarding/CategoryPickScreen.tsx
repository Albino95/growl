import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Animated, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import PrimaryButton from '../../components/ui/PrimaryButton';
import CATEGORIES, { Category, Subcategory } from '../../data/categories';
import { useAuth } from '../../store/hooks';
import { updateProfileOnServer } from '../../services/api/profile';
import { syncCohortFriends } from '../../services/api/friends';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import tw from '../../lib/tw';

type CategoryPickScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Categories'>;

interface CategoryPickScreenProps {
  navigation: CategoryPickScreenNavigationProp;
}

export default function CategoryPickScreen({ navigation }: CategoryPickScreenProps) {
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null);
  const { setOnboardingComplete, refreshProfile } = useAuth();

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

  const handleContinue = async () => {
    if (selectedCategories.length === 0) {
      alert('Please select at least one category to continue');
      return;
    }
    try {
      await updateProfileOnServer({ categories: selectedCategories });
      await syncCohortFriends();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save categories on the server.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Could not save', msg);
      }
      return;
    }
    setOnboardingComplete(selectedCategories);
    await refreshProfile();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Individual' }],
      })
    );
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
          <View style={tw`mt-3 flex-row items-center justify-between bg-green-50 rounded-xl px-4 py-3`}>
            <Text style={tw`text-sm font-semibold text-green-800`}>
              Selected: {selectedCategories.length}/3
            </Text>
            {selectedCategories.length > 0 && (
              <TouchableOpacity
                onPress={() => setSelectedCategories([])}
                style={tw`px-3 py-1 bg-white rounded-full`}
              >
                <Text style={tw`text-xs font-semibold text-green-700`}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView style={tw`flex-1 mb-6`} showsVerticalScrollIndicator={false}>
          {CATEGORIES.map((category) => {
            const isSelected = isCategorySelected(category);
            const isExpanded = expandedCategory === category.key;
            const selectedSubs = getSelectedSubcategories(category);

            return (
              <View key={category.key} style={tw`mb-3`}>
                <TouchableOpacity
                  onPress={() => setExpandedCategory(isExpanded ? null : category.key)}
                  style={tw`flex-row items-center justify-between p-4 rounded-2xl border-2 ${
                    isSelected ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 bg-white'
                  }`}
                  activeOpacity={0.7}
                >
                  <View style={tw`flex-row items-center flex-1`}>
                    <View style={tw`w-10 h-10 rounded-full ${
                      isSelected ? 'bg-green-500' : 'bg-gray-100'
                    } items-center justify-center mr-3`}>
                      <Ionicons
                        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#6B7280'}
                      />
                    </View>
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-lg font-bold ${isSelected ? 'text-green-700' : 'text-gray-800'}`}>
                        {category.label}
                      </Text>
                      {selectedSubs.length > 0 && (
                        <Text style={tw`text-sm text-green-600 mt-0.5`}>
                          {selectedSubs.length} subcategor{selectedSubs.length === 1 ? 'y' : 'ies'} selected
                        </Text>
                      )}
                    </View>
                  </View>
                  {isSelected && (
                    <View style={tw`w-8 h-8 rounded-full bg-green-500 items-center justify-center`}>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={tw`mt-2 ml-2 pl-4 border-l-2 border-green-200`}>
                    <TouchableOpacity
                      onPress={() => toggleCategory(category.key)}
                      style={tw`mb-2 p-3 rounded-xl ${
                        selectedCategories.includes(category.key) 
                          ? 'bg-green-100 border-2 border-green-500' 
                          : 'bg-gray-50 border-2 border-gray-200'
                      }`}
                      activeOpacity={0.7}
                    >
                      <View style={tw`flex-row items-center justify-between`}>
                        <Text style={tw`text-sm font-semibold ${
                          selectedCategories.includes(category.key) ? 'text-green-700' : 'text-gray-600'
                        }`}>
                          All {category.label}
                        </Text>
                        {selectedCategories.includes(category.key) && (
                          <View style={tw`w-5 h-5 rounded-full bg-green-500 items-center justify-center`}>
                            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                    {category.subcategories.map((sub) => {
                      const subKey = `${category.key}:${sub.key}`;
                      const isSubSelected = selectedCategories.includes(subKey);
                      return (
                        <TouchableOpacity
                          key={sub.key}
                          onPress={() => toggleSubcategory(category.key, sub.key)}
                          style={tw`mb-2 p-3 rounded-xl ${
                            isSubSelected
                              ? 'bg-green-100 border-2 border-green-500'
                              : 'bg-gray-50 border-2 border-gray-200'
                          }`}
                          activeOpacity={0.7}
                        >
                          <View style={tw`flex-row items-center justify-between`}>
                            <Text style={tw`text-sm ${
                              isSubSelected ? 'text-green-700 font-semibold' : 'text-gray-600'
                            }`}>
                              {sub.label}
                            </Text>
                            {isSubSelected && (
                              <View style={tw`w-5 h-5 rounded-full bg-green-500 items-center justify-center`}>
                                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                              </View>
                            )}
                          </View>
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
