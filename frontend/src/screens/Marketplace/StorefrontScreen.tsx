import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import PressableScale from '../../components/ui/PressableScale';
import MarketplaceCheckoutBanner from '../../components/business/MarketplaceCheckoutBanner';
import StorefrontSections from '../../components/storefront/StorefrontSections';
import { ProductGrid } from '../../components/storefront/FeaturedProducts';
import { verticalScrollProps } from '../../constants/scroll';
import { useRefresh } from '../../hooks/useRefresh';
import { haptic } from '../../theme/haptics';
import { alertMessage } from '../../utils/confirmDialog';
import { ApiError } from '../../services/api/http';
import { createConversation } from '../../services/api/messages';
import { toast } from '../../state/useToastStore';
import {
  getPublicStorefront,
  getStorefrontProducts,
  logStorefrontView,
  logStorefrontLinkTap,
  type PublicStorefront,
  type StorefrontLink,
  type StorefrontPinnedPost,
  type StorefrontProduct,
} from '../../services/api/storefront';

type StorefrontRouteParams = {
  Storefront: {
    businessId: string;
    /** Data already in hand at the tap site, shown while the storefront loads. */
    preview?: { name?: string; logoUrl?: string | null };
    source?: 'feed' | 'search' | 'explore' | 'storefront' | 'shop' | 'instructor' | 'link' | 'other';
  };
};

const PAGE = 24;

/**
 * Buyer-facing business page: cover, logo, name + verified seal, about, links,
 * featured products, the full catalog, hours, policies and a Message button when
 * the business accepts messages from this viewer.
 */
export default function StorefrontScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<StorefrontRouteParams, 'Storefront'>>();
  const { businessId, preview, source } = route.params;

  const [data, setData] = useState<PublicStorefront | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [messageBusy, setMessageBusy] = useState(false);
  const loggedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sf, page] = await Promise.all([
        getPublicStorefront(businessId),
        getStorefrontProducts(businessId, { limit: PAGE, offset: 0 }),
      ]);
      setData(sf);
      setProducts(page.products);
      setHasMore(page.has_more);
      setState('ready');
      if (loggedFor.current !== businessId && !sf.viewer?.is_owner) {
        loggedFor.current = businessId;
        logStorefrontView(businessId, source || 'other');
      }
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
    }
  }, [businessId, source]);

  useEffect(() => {
    setState('loading');
    setData(null);
    void load();
  }, [load]);

  const refresh = useRefresh(load);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await getStorefrontProducts(businessId, { limit: PAGE, offset: products.length });
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.products.filter((p) => !seen.has(p.id))];
      });
      setHasMore(page.has_more);
    } catch {
      alertMessage('Couldn’t load more', 'Check your connection and try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const routeNames: string[] = navigation.getState?.()?.routeNames || [];

  const openProduct = (p: StorefrontProduct) => {
    // A business previewing its own page: products are edited from Catalog, not opened here.
    if (data?.viewer?.is_owner) {
      toast.info('This is how customers see it');
      return;
    }
    if (!routeNames.includes('ProductDetail')) {
      toast.info('Products open in the customer app.');
      return;
    }
    navigation.navigate('ProductDetail', {
      productId: p.id,
      preview: {
        title: p.name,
        imageUrl: p.image_url || null,
        price: Number(p.price) || 0,
        sellerName: data?.business.name,
      },
      source: 'storefront',
    });
  };

  const openLink = async (l: StorefrontLink) => {
    logStorefrontLinkTap(businessId);
    try {
      await WebBrowser.openBrowserAsync(l.url);
    } catch {
      void Linking.openURL(l.url).catch(() => alertMessage('Couldn’t open link', l.url));
    }
  };

  const openPinned = (post: StorefrontPinnedPost) => {
    if (!data || !routeNames.includes('PostDetail')) return;
    const meta = (post.metadata || {}) as { likes?: number; comments?: number };
    navigation.navigate('PostDetail', {
      post: {
        id: post.id,
        userId: data.business.id,
        username: data.business.username,
        avatar: data.business.logo_url || '',
        image: post.image_url || '',
        caption: post.caption || '',
        category: post.category,
        subcategory: post.subcategory || undefined,
        likes: Number(meta.likes || 0),
        comments: Number(meta.comments || 0),
        createdAt: post.created_at,
      },
    });
  };

  const openProfile = () => {
    navigation.navigate('PublicProfile', {
      userId: businessId,
      preview: { username: data?.business.username, avatarUrl: data?.business.logo_url },
    });
  };

  const onMessage = async () => {
    if (messageBusy) return;
    setMessageBusy(true);
    try {
      const res = await createConversation(businessId);
      haptic('tapLight');
      const params = { conversationId: res.data.conversation.id, targetUserId: businessId };
      // Business accounts have no root `Messages`; their inbox is Business > BusinessMessages.
      if (!routeNames.includes('Messages') && routeNames.includes('Business')) {
        navigation.navigate('Business', { screen: 'BusinessMessages', params });
      } else {
        navigation.navigate('Messages', params);
      }
    } catch (e) {
      haptic('error');
      alertMessage('Couldn’t start a chat', e instanceof Error ? e.message : 'Try again later.');
    } finally {
      setMessageBusy(false);
    }
  };

  const header = (
    <ScreenHeader
      title={data?.business.name || preview?.name || 'Shop'}
      onBack={() => navigation.goBack()}
      backIcon="arrow-back"
    />
  );

  if (state === 'loading') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']} accessibilityState={{ busy: true }}>
        {header}
        <Skeleton style={tw`w-full h-40`} />
        <View style={tw`px-gutter -mt-9`}>
          <Skeleton style={tw`w-[72px] h-[72px] rounded-full`} />
          <Skeleton style={tw`h-6 w-48 rounded mt-3`} />
          <Skeleton style={tw`h-4 w-64 rounded mt-2`} />
          <View style={tw`flex-row mt-6`}>
            <Skeleton style={tw`h-44 flex-1 rounded-card mr-3`} />
            <Skeleton style={tw`h-44 flex-1 rounded-card`} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'missing') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <EmptyState
          icon="storefront-outline"
          title="This shop isn’t available"
          description="It may have closed, or it isn’t open to you right now."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  if (state === 'error' || !data) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <ErrorState title="Couldn’t load this shop" onRetry={() => {
          setState('loading');
          void load();
        }} />
      </SafeAreaView>
    );
  }

  const isOwner = !!data.viewer?.is_owner;
  const canMessage = !!data.viewer?.can_message;
  const featuredIds = new Set(data.featured_products.map((p) => p.id));
  const others = products.filter((p) => !featuredIds.has(p.id));

  const actions = (
    <View>
      <View style={tw`flex-row`}>
        {canMessage && !isOwner ? (
          <PressableScale
            onPress={() => void onMessage()}
            disabled={messageBusy}
            feedback="impactLight"
            style={tw`flex-1 flex-row items-center justify-center py-3 rounded-control bg-brand-600 mr-2 ${messageBusy ? 'opacity-60' : ''}`}
            accessibilityRole="button"
            accessibilityLabel={`Message ${data.business.name}`}
          >
            {messageBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="chatbubble-outline" size={18} color="#FFFFFF" />
                <Text style={tw`ml-2 text-body font-semibold text-white`}>Message</Text>
              </>
            )}
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={openProfile}
          style={tw`flex-1 flex-row items-center justify-center py-3 rounded-control bg-raised border border-line`}
          accessibilityRole="button"
          accessibilityLabel={`See ${data.business.name}'s posts`}
        >
          <Ionicons name="images-outline" size={18} color={theme.colors.icon} />
          <Text style={tw`ml-2 text-body font-semibold text-ink`}>Posts</Text>
        </PressableScale>
      </View>
      <MarketplaceCheckoutBanner style={tw`mt-3`} />
    </View>
  );

  const allProducts =
    data.products_count > 0 ? (
      <View style={tw`px-gutter mt-6`}>
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          {data.featured_products.length ? 'More from this shop' : 'Products'}
        </Text>
        {others.length ? (
          <ProductGrid products={others} onPress={routeNames.includes('ProductDetail') ? openProduct : undefined} />
        ) : !hasMore ? (
          <Text style={tw`text-footnote text-ink-3`}>Everything this shop sells is featured above.</Text>
        ) : null}
        {hasMore ? (
          <PressableScale
            onPress={() => void loadMore()}
            disabled={loadingMore}
            style={tw`items-center py-3 rounded-control bg-raised border border-line`}
            accessibilityRole="button"
            accessibilityLabel="Show more products"
          >
            {loadingMore ? (
              <ActivityIndicator size="small" color={theme.colors.brand} />
            ) : (
              <Text style={tw`text-body font-semibold text-ink`}>Show more</Text>
            )}
          </PressableScale>
        ) : null}
      </View>
    ) : (
      <View style={tw`px-gutter mt-6`}>
        <EmptyState icon="bag-outline" title="No products yet" description="Check back soon." />
      </View>
    );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`pb-12`}
        refreshControl={<RefreshControl {...refresh} tintColor={theme.colors.brand} />}
        {...verticalScrollProps}
      >
        <StorefrontSections
          data={data}
          onProductPress={routeNames.includes('ProductDetail') ? openProduct : undefined}
          onLinkPress={(l) => void openLink(l)}
          onPinnedPress={routeNames.includes('PostDetail') ? openPinned : undefined}
          actions={actions}
          afterFeatured={allProducts}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
