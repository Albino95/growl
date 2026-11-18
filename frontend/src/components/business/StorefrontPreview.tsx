import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import StorefrontSections from '../storefront/StorefrontSections';
import { ProductGrid } from '../storefront/FeaturedProducts';
import type { BusinessProduct } from '../../services/api/business';
import {
  emptyStorefront,
  getMyStorefront,
  getMyVerification,
  type Storefront,
  type StorefrontPinnedPost,
  type StorefrontProduct,
} from '../../services/api/storefront';

type Props = {
  visible: boolean;
  onClose: () => void;
  businessName: string;
  logoUrl?: string | null;
  shippingNote?: string;
  products: BusinessProduct[];
  /** Draft to preview (the storefront editor). Omit to load the saved storefront. */
  storefront?: Storefront | null;
  pinnedPost?: StorefrontPinnedPost | null;
  verified?: boolean;
};

/**
 * "How customers see you": the seller's real storefront page as a shopper sees it —
 * cover, about, links, featured products, hours, policies and only visible products.
 * Read-only; renders the same sections as the buyer's Storefront screen.
 */
export default function StorefrontPreview({
  visible,
  onClose,
  businessName,
  logoUrl,
  shippingNote,
  products,
  storefront: draft,
  pinnedPost = null,
  verified: verifiedProp,
}: Props) {
  const [saved, setSaved] = useState<Storefront | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    if (!draft) {
      getMyStorefront()
        .then((sf) => alive && setSaved(sf))
        .catch(() => alive && setSaved(emptyStorefront()));
    }
    if (verifiedProp === undefined) {
      getMyVerification()
        .then((v) => alive && setVerified(v.status === 'verified'))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [visible, draft, verifiedProp]);

  const storefront = draft || saved || emptyStorefront();
  const visibleProducts = products.filter((p) => !p.is_hidden) as StorefrontProduct[];
  const hiddenCount = products.length - visibleProducts.length;
  const byId = new Map(visibleProducts.map((p) => [p.id, p]));
  const featured = storefront.featured_product_ids
    .map((id) => byId.get(id))
    .filter((p): p is StorefrontProduct => !!p);
  const featuredIds = new Set(featured.map((p) => p.id));
  const others = visibleProducts.filter((p) => !featuredIds.has(p.id));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line`}>
          <View style={tw`w-14`} />
          <Text style={tw`text-callout font-semibold text-ink`} accessibilityRole="header">
            Customer view
          </Text>
          <PressableScale
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close customer view"
            style={tw`w-14 items-end`}
          >
            <Text style={tw`text-body font-semibold text-leaf-ink`}>Done</Text>
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={tw`pb-10`}>
          <StorefrontSections
            data={{
              storefront: { ...storefront, featured_product_ids: featured.map((p) => p.id) },
              business: {
                id: storefront.business_id,
                name: businessName || 'Your store',
                username: businessName,
                logo_url: logoUrl || null,
                verified: verifiedProp ?? verified,
              },
              featured_products: featured,
              pinned_post: pinnedPost,
              products_count: visibleProducts.length,
            }}
            actions={
              hiddenCount > 0 || shippingNote ? (
                <View>
                  {hiddenCount > 0 ? (
                    <Text style={tw`text-footnote text-amber-700 mb-2`}>
                      {hiddenCount} product{hiddenCount === 1 ? ' is' : 's are'} hidden from the shop and not shown here.
                    </Text>
                  ) : null}
                  {shippingNote ? (
                    <View style={tw`flex-row items-start bg-raised rounded-control px-3 py-2.5`}>
                      <Ionicons name="cube-outline" size={16} color={theme.colors.ink3} style={tw`mr-2 mt-0.5`} />
                      <Text style={tw`flex-1 text-footnote text-ink-2`}>{shippingNote}</Text>
                    </View>
                  ) : null}
                </View>
              ) : undefined
            }
            afterFeatured={
              <View style={tw`px-gutter mt-6`}>
                <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
                  {featured.length ? 'More from this shop' : 'Products'}
                </Text>
                {visibleProducts.length === 0 ? (
                  <View style={tw`items-center py-8`}>
                    <Ionicons name="bag-outline" size={32} color={theme.colors.iconMuted} />
                    <Text style={tw`text-body text-ink-2 mt-2 text-center`}>
                      Customers would see an empty shelf. Add a product to fill it.
                    </Text>
                  </View>
                ) : others.length ? (
                  <ProductGrid products={others} />
                ) : (
                  <Text style={tw`text-footnote text-ink-3`}>Everything you sell is featured above.</Text>
                )}
              </View>
            }
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
