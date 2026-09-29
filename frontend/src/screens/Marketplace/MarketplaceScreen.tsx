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
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import MarketplaceCategoryBar from '../../components/marketplace/MarketplaceCategoryBar';
import { horizontalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import { rankMarketplaceProducts, type RankedProduct } from '../../utils/ranking';
import CATEGORIES from '../../data/categories';
import { getCategoryLabel } from '../../utils/categoryLabels';

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
  const [onMyPathsOnly, setOnMyPathsOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'relevance' | 'price_asc' | 'price_desc' | 'newest'>('relevance');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /** Search hits the API; category chips filter the loaded catalog client-side. */
  const fetchParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
    }),
    [debouncedSearch]
  );

  useEffect(() => {
    dispatch(fetchProducts(fetchParams));
  }, [dispatch, fetchParams]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchProducts(fetchParams));
    setRefreshing(false);
  };

  const handleCategoryChange = (category: string | null) => {
    setSelectedSubcategory(null);
    dispatch(setSelectedCategory(category));
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      const parent = (p.category || '').split(':')[0];
      if (!parent) continue;
      counts[parent] = (counts[parent] || 0) + 1;
    }
    return counts;
  }, [products]);

  const subcategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!selectedCategory) return counts;
    for (const p of products) {
      const parent = (p.category || '').split(':')[0];
      if (parent !== selectedCategory) continue;
      const sub = (p.subcategory || '').toLowerCase();
      if (!sub) continue;
      counts[sub] = (counts[sub] || 0) + 1;
    }
    return counts;
  }, [products, selectedCategory]);

  const recommendedProducts = useMemo(() => {
    const userCategories = user?.categories || [];
    const ranked = rankMarketplaceProducts(products, userCategories, {
      userPoints: user?.points,
    });

    let filtered = selectedCategory
      ? ranked.filter((p) => {
          const parent = (p.category || '').split(':')[0];
          return parent === selectedCategory;
        })
      : ranked;

    if (selectedSubcategory) {
      filtered = filtered.filter(
        (p) => (p.subcategory || '').toLowerCase() === selectedSubcategory.toLowerCase()
      );
    }

    return filtered;
  }, [products, user?.categories, user?.points, selectedCategory, selectedSubcategory]);

  const carouselProducts = useMemo(
    () => recommendedProducts.slice(0, 6),
    [recommendedProducts]
  );

  const searchFiltered = useMemo(() => {
    let list = [...recommendedProducts];
    if (inStockOnly) {
      list = list.filter((p) => p.stock > 0);
    }
    if (onMyPathsOnly) {
      const parents = new Set<string>();
      user?.categories?.forEach((cat: string) => {
        if (cat.includes(':')) parents.add(cat.split(':')[0]);
        else if (cat) parents.add(cat);
      });
      if (parents.size > 0) {
        list = list.filter((p) => parents.has((p.category || '').split(':')[0]));
      }
    }
    if (minPrice != null) {
      list = list.filter((p) => p.price >= minPrice);
    }
    if (maxPrice != null) {
      list = list.filter((p) => p.price <= maxPrice);
    }
    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'newest') {
      list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return list;
  }, [
    recommendedProducts,
    inStockOnly,
    onMyPathsOnly,
    minPrice,
    maxPrice,
    sortBy,
    user?.categories,
  ]);

  const priceTiers = useMemo(() => [25, 50, 100, 250], []);
  const minPriceTiers = useMemo(() => [10, 25, 50], []);
  const hasActiveFilters =
    inStockOnly || onMyPathsOnly || minPrice != null || maxPrice != null || sortBy !== 'relevance';

  const clearShopFilters = () => {
    setInStockOnly(false);
    setOnMyPathsOnly(false);
    setMinPrice(null);
    setMaxPrice(null);
    setSortBy('relevance');
  };

  /** Always show catalog parents; put the user's growth areas first when present. */
  const categories = useMemo(() => {
    const userParents = new Set<string>();
    user?.categories?.forEach((cat: string) => {
      if (cat.includes(':')) userParents.add(cat.split(':')[0]);
      else if (cat) userParents.add(cat);
    });
    const catalog = CATEGORIES.map((c) => c.key);
    return [
      ...catalog.filter((k) => userParents.has(k)),
      ...catalog.filter((k) => !userParents.has(k)),
    ];
  }, [user?.categories]);

  const clearCategoryFilters = () => {
    setSelectedSubcategory(null);
    dispatch(setSelectedCategory(null));
  };

  const emptyDescription = (() => {
    if (selectedCategory && selectedSubcategory) {
      return `Nothing in ${getCategoryLabel(`${selectedCategory}:${selectedSubcategory}`)} yet. Try another subcategory or clear the filter.`;
    }
    if (selectedCategory) {
      return `No products in ${getCategoryLabel(selectedCategory)} yet. Clear the category or check back soon.`;
    }
    return 'When sellers publish SKUs, they’ll appear here ranked for your growth path.';
  })();

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <View style={tw`flex-1`}>
        <GrowChromeHeader
          right={
            <>
              <TouchableOpacity
                onPress={() => setFilterOpen(true)}
                style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
                accessibilityLabel="Open filters"
              >
                <Ionicons name="options-outline" size={17} color="#059669" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const rootNavigation = navigation.getParent() || navigation;
                  rootNavigation.navigate('UserOrders' as never);
                }}
                style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
                accessibilityLabel="Your orders"
              >
                <Ionicons name="receipt-outline" size={17} color="#059669" />
              </TouchableOpacity>
            </>
          }
        />

        <View style={tw`px-5 pt-3 pb-2`}>
          <Text style={tw`text-lg font-bold text-stone-900 mb-0.5`}>Shop</Text>
          <Text style={tw`text-sm text-stone-500 mb-2`}>
            Gear ranked for your growth paths — filter with the capsules below.
          </Text>
        </View>

        <MarketplaceCategoryBar
          categoryKeys={categories}
          selectedCategory={selectedCategory}
          selectedSubcategory={selectedSubcategory}
          counts={categoryCounts}
          subcategoryCounts={subcategoryCounts}
          totalCount={products.length}
          onSelectCategory={handleCategoryChange}
          onSelectSubcategory={setSelectedSubcategory}
        />

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
                    Products ranked by your interests and community picks.
                  </Text>
                </View>
                <SearchField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search products"
                />
                {hasActiveFilters && (
                  <View style={tw`flex-row flex-wrap mt-2`}>
                    {inStockOnly ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>In stock</Text>
                      </View>
                    ) : null}
                    {onMyPathsOnly ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>My paths</Text>
                      </View>
                    ) : null}
                    {minPrice != null ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>From ${minPrice}</Text>
                      </View>
                    ) : null}
                    {maxPrice != null ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>Under ${maxPrice}</Text>
                      </View>
                    ) : null}
                    {sortBy !== 'relevance' ? (
                      <View style={tw`px-3 py-1 bg-emerald-100 rounded-full mr-2 mb-1`}>
                        <Text style={tw`text-xs text-emerald-800 font-medium`}>
                          {sortBy === 'price_asc'
                            ? 'Price ↑'
                            : sortBy === 'price_desc'
                              ? 'Price ↓'
                              : 'Newest'}
                        </Text>
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
                      style={{ flexGrow: 0 }}
                      {...horizontalScrollProps}
                    >
                      {carouselProducts.map((item: RankedProduct<ApiProduct>) => {
                        const defaultImage =
                          item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
                        const productImage = failedProductImages[item.id]
                          ? getProductImageUrl(item.category, item.id)
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
                <SectionLabel variant="caps">
                  {selectedCategory
                    ? getCategoryLabel(
                        selectedSubcategory
                          ? `${selectedCategory}:${selectedSubcategory}`
                          : selectedCategory
                      )
                    : 'All products'}
                </SectionLabel>
              </>
            }
            renderItem={({ item }) => {
              const defaultImage = item.image_url || item.images?.[0] || getProductImageUrl(item.category, item.id);
              const productImage = failedProductImages[item.id]
                ? getProductImageUrl(item.category, item.id)
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
              ) : selectedCategory ? (
                <EmptyState
                  icon="filter-outline"
                  title="No products in this path"
                  description={emptyDescription}
                  actionLabel="Clear category"
                  onAction={clearCategoryFilters}
                />
              ) : (
                <EmptyState
                  icon="storefront-outline"
                  title="No products yet"
                  description={emptyDescription}
                />
              )
            }
          />
        )}
      </View>

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <View style={tw`flex-1 justify-end bg-black/40`}>
          <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-5 pb-10 max-h-[88%]`}>
            <View style={tw`flex-row items-center justify-between mb-4`}>
              <View>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
                  Grow! Shop
                </Text>
                <Text style={tw`text-lg font-bold text-stone-900`}>Filters</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterOpen(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/80`}>
                <Text style={tw`text-base text-stone-800`}>In stock only</Text>
                <Switch
                  value={inStockOnly}
                  onValueChange={setInStockOnly}
                  trackColor={{ false: '#E7E5E4', true: '#A7F3D0' }}
                  thumbColor={inStockOnly ? '#059669' : '#F5F5F4'}
                />
              </View>

              <View style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/80`}>
                <View style={tw`flex-1 pr-4`}>
                  <Text style={tw`text-base text-stone-800`}>On my growth paths</Text>
                  <Text style={tw`text-xs text-stone-500 mt-0.5`}>Only products in your interest areas</Text>
                </View>
                <Switch
                  value={onMyPathsOnly}
                  onValueChange={setOnMyPathsOnly}
                  trackColor={{ false: '#E7E5E4', true: '#A7F3D0' }}
                  thumbColor={onMyPathsOnly ? '#059669' : '#F5F5F4'}
                />
              </View>

              <Text style={tw`text-sm font-semibold text-stone-700 mt-4 mb-2`}>Sort by</Text>
              <View style={tw`flex-row flex-wrap`}>
                {(
                  [
                    { key: 'relevance', label: 'For you' },
                    { key: 'newest', label: 'Newest' },
                    { key: 'price_asc', label: 'Price ↑' },
                    { key: 'price_desc', label: 'Price ↓' },
                  ] as const
                ).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setSortBy(opt.key)}
                    style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                      sortBy === opt.key ? 'bg-emerald-600' : 'bg-white border border-stone-200'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-medium ${
                        sortBy === opt.key ? 'text-white' : 'text-stone-600'
                      }`}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={tw`text-sm font-semibold text-stone-700 mt-4 mb-2`}>Min price</Text>
              <View style={tw`flex-row flex-wrap`}>
                <TouchableOpacity
                  onPress={() => setMinPrice(null)}
                  style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                    minPrice == null ? 'bg-emerald-600' : 'bg-white border border-stone-200'
                  }`}
                >
                  <Text
                    style={tw`text-sm font-medium ${minPrice == null ? 'text-white' : 'text-stone-600'}`}
                  >
                    Any
                  </Text>
                </TouchableOpacity>
                {minPriceTiers.map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    onPress={() => setMinPrice(tier)}
                    style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                      minPrice === tier ? 'bg-emerald-600' : 'bg-white border border-stone-200'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-medium ${
                        minPrice === tier ? 'text-white' : 'text-stone-600'
                      }`}
                    >
                      ${tier}+
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={tw`text-sm font-semibold text-stone-700 mt-4 mb-2`}>Max price</Text>
              <View style={tw`flex-row flex-wrap`}>
                <TouchableOpacity
                  onPress={() => setMaxPrice(null)}
                  style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                    maxPrice == null ? 'bg-emerald-600' : 'bg-white border border-stone-200'
                  }`}
                >
                  <Text
                    style={tw`text-sm font-medium ${maxPrice == null ? 'text-white' : 'text-stone-600'}`}
                  >
                    Any
                  </Text>
                </TouchableOpacity>
                {priceTiers.map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    onPress={() => setMaxPrice(tier)}
                    style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                      maxPrice === tier ? 'bg-emerald-600' : 'bg-white border border-stone-200'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-medium ${
                        maxPrice === tier ? 'text-white' : 'text-stone-600'
                      }`}
                    >
                      Under ${tier}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity onPress={clearShopFilters} style={tw`mt-4 py-3 items-center`}>
                <Text style={tw`text-emerald-700 font-semibold`}>Clear filters</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setFilterOpen(false)}
                style={tw`mt-2 py-3.5 bg-emerald-600 rounded-2xl items-center mb-2`}
              >
                <Text style={tw`text-white font-semibold`}>Show results</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
