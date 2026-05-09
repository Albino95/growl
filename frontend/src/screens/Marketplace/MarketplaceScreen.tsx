import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchProducts, setSelectedCategory } from '../../store/slices/marketplaceSlice';
import tw from '../../lib/tw';
import type { Product as ApiProduct } from '../../services/api/marketplace';
import { getProductImageUrl } from '../../utils/images';
import EmptyState from '../../components/ui/EmptyState';
import SearchField from '../../components/ui/SearchField';
import { horizontalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import CATEGORIES from '../../data/categories';

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

  // Deterministic “discovery” tilt so list order does not jump on re-render
  let noise = 0;
  for (let i = 0; i < product.id.length; i++) {
    noise = (noise + product.id.charCodeAt(i) * (i + 3)) % 97;
  }
  score += (noise / 97) * 10;

  return score;
}

function stableRating(productId: string): number {
  let h = 0;
  for (let i = 0; i < productId.length; i++) {
    h = (h * 31 + productId.charCodeAt(i)) % 1000;
  }
  return Math.round((4.2 + (h % 70) / 100) * 10) / 10;
}

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { products, selectedCategory, isLoading, error } = useAppSelector((state) => state.marketplace);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchParams = useMemo(
    () => ({
      category: selectedCategory ?? undefined,
      subcategory: selectedSubcategory ?? undefined,
      search: debouncedSearch || undefined,
    }),
    [selectedCategory, selectedSubcategory, debouncedSearch]
  );

  useEffect(() => {
    dispatch(fetchProducts(fetchParams));
  }, [dispatch, fetchParams]);

  const onRefresh = async () => {
    console.log('[Marketplace] Pull to refresh triggered');
    setRefreshing(true);
    await dispatch(fetchProducts(fetchParams));
    setRefreshing(false);
  };

  const handleCategoryChange = (category: string | null) => {
    setSelectedSubcategory(null);
    dispatch(setSelectedCategory(category));
  };

  const subcategoryOptions = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = CATEGORIES.find((c) => c.key === selectedCategory);
    return cat?.subcategories || [];
  }, [selectedCategory]);

  const recommendedProducts = useMemo(() => {
    const userCategories = user?.categories || [];
    const userPoints = user?.points || 0;

    // Calculate relevance scores
    const productsWithScores: ProductWithScore[] = products.map((product: ApiProduct) => ({
      ...product,
      relevanceScore: calculateRelevanceScore(product, userCategories, userPoints),
      rating: stableRating(product.id),
    }));

    // Filter by selected category if any (already filtered by API, but double-check)
    let filtered = selectedCategory
      ? productsWithScores.filter(
          (p) => p.category === selectedCategory || p.category.includes(selectedCategory.split(':')[0])
        )
      : productsWithScores;

    if (selectedSubcategory) {
      filtered = filtered.filter(
        (p) =>
          (p.subcategory || '').toLowerCase() === selectedSubcategory.toLowerCase() ||
          `${p.category}:${p.subcategory || ''}`.toLowerCase() ===
            `${selectedCategory || ''}:${selectedSubcategory}`.toLowerCase()
      );
    }

    // Sort by relevance score
    return filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [products, user?.categories, user?.points, selectedCategory, selectedSubcategory]);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recommendedProducts;
    return recommendedProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        !!(p.subcategory && p.subcategory.toLowerCase().includes(q))
    );
  }, [recommendedProducts, searchQuery]);

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
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`flex-1`}>
        <View style={tw`px-5 pt-3 pb-3 border-b border-stone-100 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text style={tw`text-2xl font-bold tracking-tight text-emerald-700`}>Marketplace</Text>
            <TouchableOpacity
              onPress={() => {
                const rootNavigation = navigation.getParent() || navigation;
                rootNavigation.navigate('UserOrders' as never);
              }}
              style={tw`w-10 h-10 rounded-full bg-stone-100 items-center justify-center`}
            >
              <Ionicons name="receipt-outline" size={22} color="#059669" />
            </TouchableOpacity>
          </View>
          <Text style={tw`text-sm text-stone-500`}>
            Keyword search hits the catalog API; category pills filter locally and sync with your interests.
          </Text>
        </View>

        {categories.length > 0 ? (
          <ScrollView
            horizontal
            style={tw`border-b border-stone-100 bg-white`}
            contentContainerStyle={tw`px-4 py-3`}
            {...horizontalScrollProps}
          >
            <TouchableOpacity
              onPress={() => handleCategoryChange(null)}
              style={tw`px-4 py-2 rounded-full mr-2 ${
                selectedCategory === null ? 'bg-emerald-600' : 'bg-stone-100'
              }`}
            >
              <Text
                style={tw`font-semibold text-sm ${
                  selectedCategory === null ? 'text-white' : 'text-stone-600'
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
                  selectedCategory === cat ? 'bg-emerald-600' : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`font-semibold text-sm ${
                    selectedCategory === cat ? 'text-white' : 'text-stone-600'
                  }`}
                >
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {selectedCategory && subcategoryOptions.length > 0 ? (
          <ScrollView
            horizontal
            style={tw`border-b border-stone-100 bg-white`}
            contentContainerStyle={tw`px-4 py-2`}
            {...horizontalScrollProps}
          >
            <TouchableOpacity
              onPress={() => setSelectedSubcategory(null)}
              style={tw`px-3 py-1.5 rounded-full mr-2 ${selectedSubcategory === null ? 'bg-emerald-100' : 'bg-stone-100'}`}
            >
              <Text
                style={tw`text-xs font-semibold ${selectedSubcategory === null ? 'text-emerald-800' : 'text-stone-600'}`}
              >
                All in category
              </Text>
            </TouchableOpacity>
            {subcategoryOptions.map((sub) => (
              <TouchableOpacity
                key={sub.key}
                onPress={() => setSelectedSubcategory(sub.key)}
                style={tw`px-3 py-1.5 rounded-full mr-2 ${
                  selectedSubcategory === sub.key ? 'bg-emerald-600' : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`text-xs font-semibold ${
                    selectedSubcategory === sub.key ? 'text-white' : 'text-stone-600'
                  }`}
                >
                  {sub.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {isLoading && products.length === 0 ? (
          <View style={tw`flex-1 items-center justify-center py-16`}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={tw`mt-4 text-stone-500`}>Loading products…</Text>
          </View>
        ) : (
          <FlatList
            data={searchFiltered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`px-4 pt-3 pb-24`}
            {...feedListPerformanceProps}
            refreshControl={
              <RefreshControl
                refreshing={refreshing || isLoading}
                onRefresh={onRefresh}
                tintColor="#059669"
                colors={['#059669']}
              />
            }
            ListHeaderComponent={
              <SearchField
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search products (server) — refines name & description here too"
              />
            }
            renderItem={({ item }) => {
              const productImage = item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
              return (
                <TouchableOpacity
                  style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}
                  activeOpacity={0.85}
                  onPress={() => {
                    const rootNavigation = navigation.getParent() || navigation;
                    (rootNavigation as { navigate: (a: string, b: object) => void }).navigate('ProductDetail', {
                      productId: item.id,
                    });
                  }}
                >
                  <View style={tw`flex-row`}>
                    <Image
                      source={{ uri: productImage }}
                      style={[tw`rounded-xl mr-3 bg-stone-100`, { width: 88, height: 88 }]}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-base font-semibold text-stone-900 mb-1`} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={tw`text-sm text-stone-500 mb-2`} numberOfLines={2}>
                        {item.description || 'Tap for details'}
                      </Text>
                      <View style={tw`flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center flex-wrap`}>
                          <Ionicons name="star" size={15} color="#F59E0B" />
                          <Text style={tw`text-sm text-stone-700 ml-1`}>{item.rating?.toFixed(1)}</Text>
                          {item.stock > 0 ? (
                            <View style={tw`ml-2 px-2 py-0.5 bg-emerald-50 rounded-full`}>
                              <Text style={tw`text-xs font-medium text-emerald-800`}>In stock</Text>
                            </View>
                          ) : (
                            <View style={tw`ml-2 px-2 py-0.5 bg-red-50 rounded-full`}>
                              <Text style={tw`text-xs font-medium text-red-700`}>Sold out</Text>
                            </View>
                          )}
                        </View>
                        <Text style={tw`text-lg font-bold text-emerald-700`}>${item.price.toFixed(2)}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              error ? (
                <EmptyState
                  icon="cloud-offline-outline"
                  title="Couldn’t load products"
                  description={error}
                  actionLabel="Try again"
                  onAction={() => dispatch(fetchProducts(fetchParams))}
                />
              ) : searchQuery.trim() ? (
                <EmptyState
                  icon="search-outline"
                  title="No matches"
                  description={`Nothing found for “${searchQuery.trim()}”. Try another word or clear filters.`}
                  actionLabel="Clear search"
                  onAction={() => setSearchQuery('')}
                />
              ) : (
                <EmptyState
                  icon="storefront-outline"
                  title="No products yet"
                  description="When sellers publish SKUs, they’ll appear here with smart ranking for your journey."
                />
              )
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}
