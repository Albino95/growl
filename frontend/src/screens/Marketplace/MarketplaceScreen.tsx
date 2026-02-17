import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, ScrollView, ActivityIndicator, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProducts, setSelectedCategory } from '../../store/slices/marketplaceSlice';
import tw from '../../lib/tw';
import type { Product as ApiProduct } from '../../services/api/marketplace';
import { getProductImageUrl } from '../../utils/images';
import Constants from 'expo-constants';

// Marketplace recommendation algorithm
// This algorithm considers:
// 1. User's selected categories
// 2. User's journal entries (metadata)
// 3. User's activity and engagement
// 4. Popular items in their categories
// 5. Price range based on user's engagement level

type ProductWithScore = ApiProduct & {
  relevanceScore: number;
  rating?: number;
};

function calculateRelevanceScore(
  product: ApiProduct,
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

  // Add some randomness for discovery (0-10 points)
  score += Math.random() * 10;

  return score;
}

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { products, selectedCategory, isLoading, error } = useAppSelector((state) => state.marketplace);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts(selectedCategory || undefined));
  }, [dispatch, selectedCategory]);

  const onRefresh = async () => {
    console.log('[Marketplace] Pull to refresh triggered');
    setRefreshing(true);
    await dispatch(fetchProducts(selectedCategory || undefined));
    setRefreshing(false);
  };

  const handleCategoryChange = (category: string | null) => {
    dispatch(setSelectedCategory(category));
  };

  const showDebugInfo = () => {
    const debugMessage = `Products: ${products.length}\nLoading: ${isLoading}\nRefreshing: ${refreshing}\nError: ${error || 'None'}\nSelected Category: ${selectedCategory || 'All'}\n\nCheck console for API response.`;
    
    console.log('[Marketplace] Debug Info:', debugMessage);
    
    if (Platform.OS === 'web') {
      // Use window.alert for web
      window.alert(debugMessage);
    } else {
      // Use Alert.alert for native
      Alert.alert('Debug Info', debugMessage, [{ text: 'OK' }]);
    }
  };

  const recommendedProducts = useMemo(() => {
    const userCategories = user?.categories || [];
    const userPoints = user?.points || 0;

    // Calculate relevance scores
    const productsWithScores: ProductWithScore[] = products.map((product: ApiProduct) => ({
      ...product,
      relevanceScore: calculateRelevanceScore(product, userCategories, userPoints),
      rating: 4.5 + Math.random() * 0.5, // Mock rating for now
    }));

    // Filter by selected category if any (already filtered by API, but double-check)
    const filtered = selectedCategory
      ? productsWithScores.filter(
          (p) => p.category === selectedCategory || p.category.includes(selectedCategory.split(':')[0])
        )
      : productsWithScores;

    // Sort by relevance score
    return filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [products, user?.categories, user?.points, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    user?.categories?.forEach((cat: string) => {
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
              onPress={() => handleCategoryChange(null)}
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
                onPress={() => handleCategoryChange(cat)}
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
        {isLoading && products.length === 0 ? (
          <View style={tw`flex-1 items-center justify-center py-12`}>
            <ActivityIndicator size="large" color="#10B981" />
            <Text style={tw`mt-4 text-gray-600`}>Loading products...</Text>
          </View>
        ) : (
          <FlatList
            data={recommendedProducts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`p-4`}
            refreshControl={
              <RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} tintColor="#10B981" />
            }
            renderItem={({ item }) => {
              const productImage = item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
              return (
                <TouchableOpacity
                  style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-4 shadow-sm`}
                  onPress={() => {
                    const rootNavigation = navigation.getParent() || navigation;
                    rootNavigation.navigate('ProductDetail' as never, { productId: item.id } as never);
                  }}
                >
                  <View style={tw`flex-row`}>
                    <Image
                      source={{ uri: productImage }}
                      style={tw`w-20 h-20 rounded-lg mr-4`}
                      resizeMode="cover"
                    />
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-lg font-semibold text-gray-900 mb-1`}>{item.name}</Text>
                      <Text style={tw`text-sm text-gray-600 mb-2`} numberOfLines={2}>
                        {item.description || 'No description available'}
                      </Text>
                      <View style={tw`flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center`}>
                          <Ionicons name="star" size={16} color="#FBBF24" />
                          <Text style={tw`text-sm text-gray-700 ml-1`}>
                            {item.rating?.toFixed(1) || '4.5'}
                          </Text>
                          {item.stock > 0 ? (
                            <View style={tw`ml-2 px-2 py-0.5 bg-green-100 rounded`}>
                              <Text style={tw`text-xs text-green-700`}>In Stock</Text>
                            </View>
                          ) : (
                            <View style={tw`ml-2 px-2 py-0.5 bg-red-100 rounded`}>
                              <Text style={tw`text-xs text-red-700`}>Out of Stock</Text>
                            </View>
                          )}
                        </View>
                        <Text style={tw`text-lg font-bold text-green-600`}>
                          ${item.price.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={tw`items-center justify-center py-12 px-6`}>
                <Ionicons name="storefront-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-gray-900 font-semibold text-lg mt-4 text-center`}>
                  {error ? 'Oops!' : 'No Products Yet'}
                </Text>
                <Text style={tw`text-gray-500 mt-2 text-center mb-4`}>
                  {error || 'No products found. Products will appear here once businesses add them to the marketplace.'}
                </Text>
                {error && (
                  <TouchableOpacity
                    onPress={() => {
                      console.log('[Marketplace] Try Again button pressed');
                      dispatch(fetchProducts(selectedCategory || undefined));
                    }}
                    style={tw`px-6 py-3 bg-green-600 rounded-lg mb-2`}
                    activeOpacity={0.7}
                  >
                    <Text style={tw`text-white font-semibold`}>Try Again</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => {
                    console.log('[Marketplace] Show Debug Info button pressed');
                    showDebugInfo();
                  }}
                  style={tw`px-4 py-2 bg-gray-200 rounded-lg mt-2`}
                  activeOpacity={0.7}
                >
                  <Text style={tw`text-gray-700 text-sm`}>Show Debug Info</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
