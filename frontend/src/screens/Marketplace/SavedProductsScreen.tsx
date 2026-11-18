import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import SkeletonCard from '../../components/ui/SkeletonCard';
import SaveHeart from '../../components/bizinsights/SaveHeart';
import { useSavedProducts } from '../../components/bizinsights/useSavedProducts';
import { getSavedProducts, type SavedProduct } from '../../services/api/bizInsights';
import { resolveProductImageUri } from '../../utils/images';
import { useAuth } from '../../store/hooks';

/** Buyer: products they hearted. Unsaving from here removes the row right away. */
export default function SavedProductsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const savedIds = useSavedProducts((s) => s.ids);
  const savedLoaded = useSavedProducts((s) => s.loaded && !s.loading);
  const loadSaved = useSavedProducts((s) => s.load);
  const [items, setItems] = useState<SavedProduct[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getSavedProducts();
      setItems(res ?? []);
      setState('ready');
      void loadSaved(user?.id, true);
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, [loadSaved, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Hearts toggled off here (or elsewhere) drop out of the list.
  const visible = savedLoaded ? (items || []).filter((p) => savedIds[p.id]) : items || [];

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line/80 bg-card`}>
        <PressableScale
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </PressableScale>
        <Text style={tw`text-lg font-semibold text-ink`}>Saved</Text>
        <View style={tw`w-6`} />
      </View>

      {state === 'loading' && !items ? (
        <View style={tw`px-gutter pt-4`}>
          <SkeletonCard variant="product" />
          <SkeletonCard variant="product" />
        </View>
      ) : state === 'error' && !items ? (
        <ErrorState title="Couldn’t load your saved products" onRetry={() => void load()} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          contentContainerStyle={tw`px-gutter pt-4 pb-10 ${visible.length === 0 ? 'flex-1' : ''}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={theme.colors.brand}
              colors={[theme.colors.brand]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="Nothing saved yet"
              description="Tap the heart on any product to keep it here for later."
              actionLabel="Browse the shop"
              onAction={() => navigation.goBack()}
            />
          }
          renderItem={({ item }) => {
            const img = resolveProductImageUri(item.image_url, item.images);
            return (
              <PressableScale
                feedback="open"
                pressedScale={0.985}
                style={tw`flex-row bg-card border border-line/80 rounded-card p-3 mb-3`}
                onPress={() =>
                  navigation.navigate('ProductDetail', {
                    productId: item.id,
                    source: 'other',
                    preview: { title: item.name, imageUrl: img, price: item.price, sellerName: item.business?.username },
                  })
                }
              >
                {img ? (
                  <Image source={{ uri: img }} style={[tw`rounded-control mr-3 bg-raised`, { width: 72, height: 88 }]} contentFit="cover" />
                ) : (
                  <View style={[tw`rounded-control mr-3 bg-raised items-center justify-center`, { width: 72, height: 88 }]}>
                    <Ionicons name="image-outline" size={22} color={theme.colors.iconMuted} />
                  </View>
                )}
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-base font-semibold text-ink`} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.business?.username ? (
                    <Text style={tw`text-xs text-ink-3 mt-0.5`} numberOfLines={1}>
                      {item.business.username}
                    </Text>
                  ) : null}
                  <Text style={tw`text-base font-bold text-brand-700 mt-1.5`}>${Number(item.price).toFixed(2)}</Text>
                </View>
                <SaveHeart productId={item.id} ownerId={item.user_id} />
              </PressableScale>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
