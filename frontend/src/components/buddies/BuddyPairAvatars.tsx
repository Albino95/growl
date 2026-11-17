import React from 'react';
import { View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import GrowAvatar from '../ui/GrowAvatar';
import type { BuddyUser } from '../../services/api/buddies';

type Props = {
  me: { id?: string; username?: string; avatar?: string | null } | null | undefined;
  them: BuddyUser;
  size?: number;
};

/** Your avatar and your buddy's, gently overlapping. */
export default function BuddyPairAvatars({ me, them, size = 36 }: Props) {
  const ring = { borderWidth: 2, borderColor: theme.colors.card };
  return (
    <View
      style={[tw`flex-row`, { width: size * 1.6 + 4 }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <GrowAvatar userId={me?.id} username={me?.username} uri={me?.avatar ?? null} size={size} style={ring} />
      <GrowAvatar
        userId={them.id}
        username={them.username}
        uri={them.avatar_url}
        size={size}
        style={[ring, { marginLeft: -size * 0.4 }]}
      />
    </View>
  );
}
