import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import GrowImage from '../ui/GrowImage';
import CATEGORIES from '../../data/categories';
import VerifiedBadge from './VerifiedBadge';
import type { Storefront } from '../../services/api/storefront';

/** "fitness" → "Fitness", "fitness:cardio" → "Cardio". Unknown keys are prettified. */
export function pathTagLabel(tag: string): string {
  const [top, sub] = tag.split(':');
  const cat = CATEGORIES.find((c) => c.key === top);
  if (sub) {
    const s = cat?.subcategories.find((x) => x.key === sub);
    if (s) return s.label;
  } else if (cat) {
    return cat.label;
  }
  const raw = sub || top || tag;
  return raw.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

type Props = {
  name: string;
  logoUrl?: string | null;
  verified?: boolean;
  storefront: Pick<Storefront, 'cover_url' | 'tagline' | 'path_tags' | 'location_label'>;
  productsCount?: number;
  followersCount?: number;
};

/** Cover photo, round logo overlapping it, name + verified seal, tagline, path chips. */
export default function StorefrontHeader({
  name,
  logoUrl,
  verified,
  storefront,
  productsCount,
  followersCount,
}: Props) {
  const meta: string[] = [];
  if (typeof productsCount === 'number') meta.push(`${productsCount} product${productsCount === 1 ? '' : 's'}`);
  if (typeof followersCount === 'number' && followersCount > 0) {
    meta.push(`${followersCount} follower${followersCount === 1 ? '' : 's'}`);
  }

  return (
    <View>
      {storefront.cover_url ? (
        <GrowImage
          source={{ uri: storefront.cover_url }}
          style={tw`w-full h-40 bg-raised`}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          accessibilityLabel={`${name} cover photo`}
        />
      ) : (
        <View style={[tw`w-full h-28`, { backgroundColor: theme.colors.brandSoft }]} />
      )}

      <View style={tw`px-gutter`}>
        <View style={tw`-mt-9 mb-2`}>
          {logoUrl ? (
            <GrowImage
              source={{ uri: logoUrl }}
              style={[tw`w-[72px] h-[72px] rounded-full border-4 bg-raised`, { borderColor: theme.colors.page }]}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={[
                tw`w-[72px] h-[72px] rounded-full border-4 bg-raised items-center justify-center`,
                { borderColor: theme.colors.page },
              ]}
            >
              <Ionicons name="storefront-outline" size={28} color={theme.colors.iconMuted} />
            </View>
          )}
        </View>

        <View style={tw`flex-row items-center`}>
          <Text style={tw`text-title font-bold text-ink flex-shrink`} numberOfLines={2} accessibilityRole="header">
            {name || 'Your store'}
          </Text>
          {verified ? <VerifiedBadge size={18} /> : null}
        </View>

        {storefront.tagline ? (
          <Text style={tw`text-body text-ink-2 mt-1`}>{storefront.tagline}</Text>
        ) : null}

        {storefront.location_label || meta.length ? (
          <View style={tw`flex-row flex-wrap items-center mt-2`}>
            {storefront.location_label ? (
              <View style={tw`flex-row items-center mr-3`}>
                <Ionicons name="location-outline" size={14} color={theme.colors.ink3} />
                <Text style={tw`text-footnote text-ink-3 ml-1`}>{storefront.location_label}</Text>
              </View>
            ) : null}
            {meta.length ? <Text style={tw`text-footnote text-ink-3`}>{meta.join(' · ')}</Text> : null}
          </View>
        ) : null}

        {storefront.path_tags.length ? (
          <View style={tw`flex-row flex-wrap mt-3`}>
            {storefront.path_tags.map((t) => (
              <View key={t} style={tw`px-3 py-1 mr-2 mb-2 rounded-chip bg-raised border border-line`}>
                <Text style={tw`text-caption font-medium text-ink-2`}>{pathTagLabel(t)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
