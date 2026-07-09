import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Modal,
  Switch,
} from 'react-native';
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
import SectionLabel from '../../components/ui/SectionLabel';
import SkeletonCard from '../../components/ui/SkeletonCard';
import { horizontalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import { rankMarketplaceProducts, type RankedProduct } from '../../utils/ranking';
import CATEGORIES from '../../data/categories';

export default function MarketplaceScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { products, selectedCategory, isLoading, error } = useAppSelector((state) => state.marketplace);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [failedProductImages, setFailedProductImages] = useState<Record<string, boolean>>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

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
    const ranked = rankMarketplaceProducts(products, userCategories, {
      userPoints: user?.points,
    });

    let filtered = selectedCategory
      ? ranked.filter(
          (p) => p.category === selectedCategory || p.category.includes(selectedCategory.split(':')[0])
        )
      : ranked;

    if (selectedSubcategory) {
      filtered = filtered.filter(
        (p) =>
          (p.subcategory || '').toLowerCase() === selectedSubcategory.toLowerCase() ||
          `${p.category}:${p.subcategory || ''}`.toLowerCase() ===
            `${selectedCategory || ''}:${selectedSubcategory}`.toLowerCase()
      );
    }

    return filtered;
  }, [products, user?.categories, user?.points, selectedCategory, selectedSubcategory]);

  const carouselProducts = useMemo(
    () => recommendedProducts.slice(0, 6),
    [recommendedProducts]
  );

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = recommendedProducts;
    if (inStockOnly) {
      list = list.filter((p) => p.stock > 0);
    }
    if (maxPrice != null) {
      list = list.filter((p) => p.price <= maxPrice);
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        !!(p.subcategory && p.subcategory.toLowerCase().includes(q))
    );
  }, [recommendedProducts, searchQuery, inStockOnly, maxPrice]);

  const priceTiers = useMemo(() => [25, 50, 100, 250], []);

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
            <View style={tw`flex-row items-center`}>
              <TouchableOpacity
                onPress={() => setFilterOpen(true)}
                style={tw`w-10 h-10 rounded-full bg-stone-100 items-center justify-center mr-2`}
              >
                <Ionicons name="options-outline" size={22} color="#059669" />
              </TouchableOpacity>
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
              style={tw`px-5 py-2.5 rounded-full mr-2 min-h-[42px] items-center justify-center ${
                selectedCategory === null ? 'bg-emerald-600' : 'bg-stone-100'
              }`}
            >
              <Text
                style={tw`font-semibold text-[15px] ${
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
                style={tw`px-5 py-2.5 rounded-full mr-2 min-h-[42px] items-center justify-center ${
                  selectedCategory === cat ? 'bg-emerald-600' : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`font-semibold text-[15px] ${
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
              style={tw`px-4 py-2 rounded-full mr-2 min-h-[38px] items-center justify-center ${selectedSubcategory === null ? 'bg-emerald-100' : 'bg-stone-100'}`}
            >
              <Text
                style={tw`text-sm font-semibold ${selectedSubcategory === null ? 'text-emerald-800' : 'text-stone-600'}`}
              >
                All in category
              </Text>
            </TouchableOpacity>
            {subcategoryOptions.map((sub) => (
              <TouchableOpacity
                key={sub.key}
                onPress={() => setSelectedSubcategory(sub.key)}
                style={tw`px-4 py-2 rounded-full mr-2 min-h-[38px] items-center justify-center ${
                  selectedSubcategory === sub.key ? 'bg-emerald-600' : 'bg-stone-100'
                }`}
              >
                <Text
                  style={tw`text-sm font-semibold ${
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
          <View style={tw`flex-1 px-4 pt-3`}>
            <SkeletonCard variant="product" />
            <SkeletonCard variant="product" />
            <SkeletonCard variant="product" />
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
              <>
                <View style={tw`mb-4 rounded-2xl overflow-hidden bg-emerald-700 px-5 py-5`}>
                  <Text style={tw`text-white text-xl font-bold`}>Curated for your path</Text>
                  <Text style={tw`text-emerald-100 text-sm mt-1`}>
                    Products ranked by your interests, journal tags, and community picks.
                  </Text>
                </View>
                <SearchField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search products"
                />
                {(inStockOnly || maxPrice != null) && (
                  <View style={tw`flex-row flex-wrap mt-2`}>
                    {inStockOnly ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>In stock</Text>
                      </View>
                    ) : null}
                    {maxPrice != null ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>Under ${maxPrice}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
                {carouselProducts.length > 0 && !searchQuery.trim() ? (
                  <View style={tw`mt-4 mb-2`}>
                    <SectionLabel variant="caps">Recommended for you</SectionLabel>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={tw`pt-2 pb-1`}
                      {...horizontalScrollProps}
                    >
                      {carouselProducts.map((item: RankedProduct<ApiProduct>) => {
                        const defaultImage =
                          item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
                        const productImage = failedProductImages[item.id]
                          ? `https://picsum.photos/seed/fallback-product-${encodeURIComponent(item.id)}/600/600`
                          : defaultImage;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={tw`w-40 mr-3 bg-white border border-stone-100 rounded-2xl overflow-hidden`}
                            onPress={() => {
                              const rootNavigation = navigation.getParent() || navigation;
                              (rootNavigation as { navigate: (a: string, b: object) => void }).navigate(
                                'ProductDetail',
                                { productId: item.id }
                              );
                            }}
                          >
                            <Image
                              source={{ uri: productImage }}
                              style={tw`w-full h-48 bg-stone-100`}
                              contentFit="cover"
                            />
                            <View style={tw`p-2.5`}>
                              <Text style={tw`text-sm font-semibold text-stone-900`} numberOfLines={2}>
                                {item.name}
                              </Text>
                              <Text style={tw`text-base font-bold text-brand-700 mt-1`}>
                                ${item.price.toFixed(2)}
                              </Text>
                              {item.matchLabel ? (
                                <Text style={tw`text-[10px] text-brand-600 mt-0.5`} numberOfLines={1}>
                                  {item.matchLabel}
                                </Text>
                              ) : item.isNew ? (
                                <Text style={tw`text-[10px] text-violet-600 mt-0.5`}>New</Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                <SectionLabel variant="caps">All products</SectionLabel>
              </>
            }
            renderItem={({ item }) => {
              const defaultImage = item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
              const productImage = failedProductImages[item.id]
                ? `https://picsum.photos/seed/fallback-product-${encodeURIComponent(item.id)}/600/600`
                : defaultImage;
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
                      style={[tw`rounded-xl mr-3 bg-stone-100`, { width: 96, height: 120 }]}
                      contentFit="cover"
                      transition={150}
                      onError={() => {
                        setFailedProductImages((prev) =>
                          prev[item.id] ? prev : { ...prev, [item.id]: true }
                        );
                      }}
                    />
                    <View style={tw`flex-1`}>
                      <Text style={tw`text-base font-semibold text-stone-900 mb-1`} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={tw`text-sm text-stone-500 mb-2`} numberOfLines={2}>
                        {item.description || 'Tap for details'}
                      </Text>
                      <View style={tw`flex-row items-center justify-between`}>
                        <View style={tw`flex-row items-center flex-wrap gap-1`}>
                          {item.isNew ? (
                            <View style={tw`px-2 py-0.5 bg-violet-50 rounded-full`}>
                              <Text style={tw`text-xs font-medium text-violet-700`}>New</Text>
                            </View>
                          ) : null}
                          {item.stock > 0 ? (
                            <View style={tw`px-2 py-0.5 bg-emerald-50 rounded-full`}>
                              <Text style={tw`text-xs font-medium text-emerald-800`}>In stock</Text>
                            </View>
                          ) : (
                            <View style={tw`px-2 py-0.5 bg-red-50 rounded-full`}>
                              <Text style={tw`text-xs font-medium text-red-700`}>Sold out</Text>
                            </View>
                          )}
                        </View>
                        <Text style={tw`text-lg font-bold text-emerald-700`}>${item.price.toFixed(2)}</Text>
                      </View>
                      {item.matchLabel ? (
                        <Text style={tw`text-xs text-brand-600 mt-1`} numberOfLines={1}>
                          {item.matchLabel}
                        </Text>
                      ) : null}
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

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={tw`flex-1 justify-end bg-black/40`}>
          <View style={tw`bg-white rounded-t-3xl px-5 pt-5 pb-10`}>
            <View style={tw`flex-row items-center justify-between mb-4`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={tw`flex-row items-center justify-between py-3 border-b border-stone-100`}>
              <Text style={tw`text-base text-stone-800`}>In stock only</Text>
              <Switch
                value={inStockOnly}
                onValueChange={setInStockOnly}
                trackColor={{ false: '#E7E5E4', true: '#A7F3D0' }}
                thumbColor={inStockOnly ? '#059669' : '#F5F5F4'}
              />
            </View>

            <Text style={tw`text-sm font-semibold text-stone-700 mt-4 mb-2`}>Max price</Text>
            <View style={tw`flex-row flex-wrap`}>
              <TouchableOpacity
                onPress={() => setMaxPrice(null)}
                style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${maxPrice == null ? 'bg-emerald-600' : 'bg-stone-100'}`}
              >
                <Text style={tw`text-sm font-medium ${maxPrice == null ? 'text-white' : 'text-stone-600'}`}>Any</Text>
              </TouchableOpacity>
              {priceTiers.map((tier) => (
                <TouchableOpacity
                  key={tier}
                  onPress={() => setMaxPrice(tier)}
                  style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${maxPrice === tier ? 'bg-emerald-600' : 'bg-stone-100'}`}
                >
                  <Text style={tw`text-sm font-medium ${maxPrice === tier ? 'text-white' : 'text-stone-600'}`}>
                    Under ${tier}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => {
                setInStockOnly(false);
                setMaxPrice(null);
              }}
              style={tw`mt-4 py-3 items-center`}
            >
              <Text style={tw`text-brand-700 font-semibold`}>Clear filters</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setFilterOpen(false)}
              style={tw`mt-2 py-3.5 bg-emerald-600 rounded-2xl items-center`}
            >
              <Text style={tw`text-white font-semibold`}>Show results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
