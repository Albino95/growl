import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowImage from '../ui/GrowImage';
import VerifiedBadge from './VerifiedBadge';
import { avatarSource } from '../../utils/images';
import { getVerifiedBusinesses } from '../../services/api/storefront';

type Props = {
  businessId: string;
  name: string;
  avatarUri?: string | null;
  style?: object;
};

/** "Sold by <shop> ✓ ›" — opens the business's storefront. */
export default function SoldByLink({ businessId, name, avatarUri, style }: Props) {
  const navigation = useNavigation<any>();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let alive = true;
    void getVerifiedBusinesses([businessId]).then((set) => {
      if (alive) setVerified(set.has(businessId));
    });
    return () => {
      alive = false;
    };
  }, [businessId]);

  return (
    <PressableScale
      onPress={() =>
        navigation.navigate('Storefront', {
          businessId,
          preview: { name, logoUrl: avatarUri || null },
          source: 'shop',
        })
      }
      style={[tw`flex-row items-center self-start`, style]}
      hitSlop={6}
      accessibilityRole="link"
      accessibilityLabel={`Sold by ${name}${verified ? ', verified business' : ''}. Open shop`}
    >
      <GrowImage source={avatarSource(avatarUri)} style={tw`w-8 h-8 rounded-full mr-2 bg-raised`} />
      <Text style={tw`text-sm text-ink-2`}>
        Sold by <Text style={tw`font-semibold text-ink`}>{name}</Text>
      </Text>
      {verified ? <VerifiedBadge size={14} /> : null}
      <View style={tw`ml-1`}>
        <Ionicons name="chevron-forward" size={14} color={theme.colors.iconMuted} />
      </View>
    </PressableScale>
  );
}
