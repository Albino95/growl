import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

// Marketplace recommendation algorithm
// This algorithm considers:
// 1. User's selected categories
// 2. User's journal entries (metadata)
// 3. User's activity and engagement
// 4. Popular items in their categories
// 5. Price range based on user's engagement level

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  subcategory: string;
  rating: number;
  relevanceScore: number;
};

// Mock products - in real app, this would come from API
const ALL_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Premium Fitness Tracker',
    description: 'Track your workouts and progress',
    price: 99.99,
    image: '🏋️',
    category: 'fitness',
    subcategory: 'losing-weight',
    rating: 4.8,
    relevanceScore: 0,
  },
  {
    id: '2',
    name: 'Yoga Mat Pro',
    description: 'Professional grade yoga mat',
    price: 49.99,
    image: '🧘',
    category: 'fitness',
    subcategory: 'flexibility',
    rating: 4.6,
    relevanceScore: 0,
  },
  {
    id: '3',
    name: 'Digital Piano Course',
    description: 'Learn piano from scratch',
    price: 79.99,
    image: '🎹',
    category: 'art',
    subcategory: 'piano',
    rating: 4.9,
    relevanceScore: 0,
  },
  {
    id: '4',
    name: 'Meal Prep Containers Set',
    description: 'BPA-free containers for meal planning',
    price: 29.99,
    image: '🍱',
    category: 'nutrition',
    subcategory: 'meal-planning',
    rating: 4.7,
    relevanceScore: 0,
  },
  {
    id: '5',
    name: 'Meditation App Premium',
    description: 'Guided meditation sessions',
    price: 9.99,
    image: '🧘‍♀️',
    category: 'mindset',
    subcategory: 'meditation',
    rating: 4.8,
    relevanceScore: 0,
  },
  {
    id: '6',
    name: 'Habit Tracker Journal',
    description: 'Physical journal for tracking habits',
    price: 19.99,
    image: '📓',
    category: 'discipline',
    subcategory: 'habit-building',
    rating: 4.5,
    relevanceScore: 0,
  },
];

function calculateRelevanceScore(
  product: Product,
  userCategories: string[],
  userPoints: number = 0
): number {
  let score = 0;

  // Check if product matches user's categories
  userCategories.forEach((cat) => {
    if (cat === product.category) {
      score += 50; // Direct category match
    } else if (cat.includes(product.category) || product.category.includes(cat.split(':')[0])) {
      score += 30; // Partial match
    }

    // Check subcategory match
    if (cat.includes(':')) {
      const [catKey, subKey] = cat.split(':');
      if (catKey === product.category && subKey === product.subcategory) {
        score += 40; // Perfect subcategory match
      }
    }
  });

  // Boost score based on user engagement (points)
  if (userPoints > 100) {
    score += 10; // Active users get premium recommendations
  }

  // Boost score based on product rating
  score += product.rating * 5;

  // Add some randomness for discovery (0-10 points)
  score += Math.random() * 10;

  return score;
}

export default function MarketplaceScreen() {
  const { user } = useAuthStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const recommendedProducts = useMemo(() => {
    const userCategories = user?.categories || [];
    const userPoints = user?.points || 0;

    // Calculate relevance scores
    const productsWithScores = ALL_PRODUCTS.map((product) => ({
      ...product,
      relevanceScore: calculateRelevanceScore(product, userCategories, userPoints),
    }));

    // Filter by selected category if any
    const filtered = selectedCategory
      ? productsWithScores.filter(
          (p) => p.category === selectedCategory || p.category.includes(selectedCategory.split(':')[0])
        )
      : productsWithScores;

    // Sort by relevance score
    return filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [user?.categories, user?.points, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    user?.categories?.forEach((cat) => {
      if (cat.includes(':')) {
        cats.add(cat.split(':')[0]);
      } else {
        cats.add(cat);
      }
    });
    return Array.from(cats);
  }, [user?.categories]);

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-6 pt-4 pb-3 border-b border-gray-200`}>
          <Text style={tw`text-3xl font-bold text-green-600 mb-2`}>Marketplace</Text>
          <Text style={tw`text-gray-600`}>
            Personalized products based on your growth journey
          </Text>
        </View>

        {/* Category Filter */}
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={tw`border-b border-gray-200`}
            contentContainerStyle={tw`px-4 py-3`}
          >
            <TouchableOpacity
              onPress={() => setSelectedCategory(null)}
              style={tw`px-4 py-2 rounded-full mr-2 ${
                selectedCategory === null ? 'bg-green-600' : 'bg-gray-100'
              }`}
            >
              <Text
                style={tw`font-medium ${
                  selectedCategory === null ? 'text-white' : 'text-gray-700'
                }`}
              >
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={tw`px-4 py-2 rounded-full mr-2 ${
                  selectedCategory === cat ? 'bg-green-600' : 'bg-gray-100'
                }`}
              >
                <Text
                  style={tw`font-medium ${
                    selectedCategory === cat ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Products List */}
        <FlatList
          data={recommendedProducts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`p-4`}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm`}
            >
              <View style={tw`flex-row`}>
                <View style={tw`w-20 h-20 bg-gray-100 rounded-lg items-center justify-center mr-4`}>
                  <Text style={tw`text-4xl`}>{item.image}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-lg font-semibold text-gray-900 mb-1`}>{item.name}</Text>
                  <Text style={tw`text-sm text-gray-600 mb-2`} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <View style={tw`flex-row items-center justify-between`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="star" size={16} color="#FBBF24" />
                      <Text style={tw`text-sm text-gray-700 ml-1`}>{item.rating}</Text>
                    </View>
                    <Text style={tw`text-lg font-bold text-green-600`}>${item.price}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="storefront-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>
                No products found. Select categories to see personalized recommendations.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

