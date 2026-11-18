import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowImage from '../ui/GrowImage';
import StorefrontHeader from './StorefrontHeader';
import FeaturedProducts from './FeaturedProducts';
import PoliciesSection from './PoliciesSection';
import HoursList from './HoursList';
import type {
  PublicStorefront,
  StorefrontLink,
  StorefrontPinnedPost,
  StorefrontProduct,
} from '../../services/api/storefront';

const ABOUT_CLAMP = 4;

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>{children}</Text>
  );
}

function About({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 220 || text.split('\n').length > ABOUT_CLAMP;
  return (
    <View>
      <Text style={tw`text-body text-ink-2 leading-6`} numberOfLines={expanded || !long ? undefined : ABOUT_CLAMP}>
        {text}
      </Text>
      {long ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less' : 'Read more about this shop'}
          style={tw`mt-1 self-start`}
        >
          <Text style={tw`text-footnote font-semibold text-leaf-ink`}>{expanded ? 'Show less' : 'Read more'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

function hostOf(url: string): string {
  const m = url.match(/^https:\/\/([^/?#]+)/i);
  return m ? m[1].replace(/^www\./, '') : url;
}

function Links({ links, onPress }: { links: StorefrontLink[]; onPress?: (l: StorefrontLink) => void }) {
  return (
    <View style={tw`bg-card border border-line rounded-card overflow-hidden`}>
      {links.map((l, i) => (
        <PressableScale
          key={`${l.url}-${i}`}
          pressedScale={0.99}
          disabled={!onPress}
          onPress={() => onPress?.(l)}
          style={tw`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-line' : ''}`}
          accessibilityRole="link"
          accessibilityLabel={`${l.label}, opens ${hostOf(l.url)} in your browser`}
        >
          <Ionicons name="link-outline" size={18} color={theme.colors.icon} />
          <View style={tw`flex-1 ml-3`}>
            <Text style={tw`text-body font-semibold text-ink`} numberOfLines={1}>
              {l.label}
            </Text>
            <Text style={tw`text-caption text-ink-3`} numberOfLines={1}>
              {hostOf(l.url)}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={theme.colors.iconMuted} />
        </PressableScale>
      ))}
    </View>
  );
}

function PinnedPost({ post, onPress }: { post: StorefrontPinnedPost; onPress?: (p: StorefrontPinnedPost) => void }) {
  return (
    <PressableScale
      disabled={!onPress}
      onPress={() => onPress?.(post)}
      style={tw`flex-row bg-card border border-line rounded-card overflow-hidden`}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`Pinned post${post.caption ? `: ${post.caption}` : ''}`}
    >
      {post.image_url ? (
        <GrowImage source={{ uri: post.image_url }} style={tw`w-24 h-24 bg-raised`} contentFit="cover" />
      ) : (
        <View style={tw`w-24 h-24 bg-raised items-center justify-center`}>
          <Ionicons name="document-text-outline" size={22} color={theme.colors.iconMuted} />
        </View>
      )}
      <View style={tw`flex-1 p-3 justify-center`}>
        <View style={tw`flex-row items-center mb-1`}>
          <Ionicons name="pin" size={12} color={theme.colors.ink3} />
          <Text style={tw`text-caption font-semibold text-ink-3 ml-1`}>Pinned</Text>
        </View>
        <Text style={tw`text-footnote text-ink`} numberOfLines={3}>
          {post.caption || 'See the post'}
        </Text>
      </View>
    </PressableScale>
  );
}

type Props = {
  data: Pick<PublicStorefront, 'storefront' | 'business' | 'featured_products' | 'pinned_post'> & {
    products_count?: number;
  };
  onProductPress?: (p: StorefrontProduct) => void;
  onLinkPress?: (l: StorefrontLink) => void;
  onPinnedPress?: (p: StorefrontPinnedPost) => void;
  /** Rendered under the header (e.g. the Message button, the checkout-off banner). */
  actions?: React.ReactNode;
  /** Rendered after the featured rail (e.g. the "All products" grid). */
  afterFeatured?: React.ReactNode;
};

/**
 * The whole storefront page body, shared by the buyer screen and the seller's
 * "customer view" preview so both always look the same.
 */
export default function StorefrontSections({
  data,
  onProductPress,
  onLinkPress,
  onPinnedPress,
  actions,
  afterFeatured,
}: Props) {
  const { storefront, business, featured_products, pinned_post } = data;
  const hasVisit = !!(storefront.pickup_note || storefront.hours.length);
  return (
    <View>
      <StorefrontHeader
        name={business.name}
        logoUrl={business.logo_url}
        verified={business.verified}
        storefront={storefront}
        productsCount={data.products_count}
        followersCount={business.followers_count}
      />

      {actions ? <View style={tw`px-gutter mt-3`}>{actions}</View> : null}

      {storefront.about ? (
        <View style={tw`px-gutter mt-5`}>
          <SectionTitle>About</SectionTitle>
          <About text={storefront.about} />
        </View>
      ) : null}

      {pinned_post ? (
        <View style={tw`px-gutter mt-5`}>
          <PinnedPost post={pinned_post} onPress={onPinnedPress} />
        </View>
      ) : null}

      {featured_products.length ? (
        <View style={tw`mt-6`}>
          <FeaturedProducts products={featured_products} onPress={onProductPress} />
        </View>
      ) : null}

      {afterFeatured}

      {storefront.links.length ? (
        <View style={tw`px-gutter mt-6`}>
          <SectionTitle>Links</SectionTitle>
          <Links links={storefront.links} onPress={onLinkPress} />
        </View>
      ) : null}

      {hasVisit ? (
        <View style={tw`px-gutter mt-6`}>
          <SectionTitle>Visit</SectionTitle>
          <View style={tw`bg-card border border-line rounded-card px-4 py-3`}>
            {storefront.pickup_note ? (
              <View style={tw`flex-row items-start ${storefront.hours.length ? 'mb-3' : ''}`}>
                <Ionicons name="bag-handle-outline" size={16} color={theme.colors.ink3} style={tw`mr-2 mt-0.5`} />
                <Text style={tw`flex-1 text-footnote text-ink-2`}>{storefront.pickup_note}</Text>
              </View>
            ) : null}
            <HoursList hours={storefront.hours} />
          </View>
        </View>
      ) : null}

      {storefront.policies.shipping || storefront.policies.returns || storefront.policies.pickup ? (
        <View style={tw`px-gutter mt-6`}>
          <SectionTitle>Policies</SectionTitle>
          <PoliciesSection policies={storefront.policies} />
        </View>
      ) : null}
    </View>
  );
}
