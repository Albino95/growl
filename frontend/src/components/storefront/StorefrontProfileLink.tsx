import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import VerifiedBadge from './VerifiedBadge';
import { getPublicStorefront, type PublicStorefront } from '../../services/api/storefront';

/**
 * "Visit shop" row for a business's public profile. Renders nothing for people
 * (the storefront endpoint 404s for non-business accounts) or while offline.
 */
export default function StorefrontProfileLink({ userId }: { userId: string }) {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<PublicStorefront | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    getPublicStorefront(userId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [userId]);

  if (!data) return null;
  const { business, storefront, products_count } = data;
  return (
    <PressableScale
      onPress={() =>
        navigation.navigate('Storefront', {
          businessId: userId,
          preview: { name: business.name, logoUrl: business.logo_url },
          source: 'other',
        })
      }
      style={tw`flex-row items-center bg-card border border-line rounded-card px-4 py-3 mb-3`}
      accessibilityRole="button"
      accessibilityLabel={`Visit ${business.name}'s shop${business.verified ? ', verified business' : ''}`}
    >
      <View style={[tw`w-9 h-9 rounded-full items-center justify-center`, { backgroundColor: theme.colors.brandSoft }]}>
        <Ionicons name="storefront-outline" size={18} color={theme.colors.leafInk} />
      </View>
      <View style={tw`flex-1 ml-3`}>
        <View style={tw`flex-row items-center`}>
          <Text style={tw`text-body font-semibold text-ink flex-shrink`} numberOfLines={1}>
            Visit shop
          </Text>
          {business.verified ? <VerifiedBadge size={15} withLabel /> : null}
        </View>
        <Text style={tw`text-caption text-ink-3`} numberOfLines={1}>
          {storefront.tagline || `${products_count} product${products_count === 1 ? '' : 's'}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
    </PressableScale>
  );
}
