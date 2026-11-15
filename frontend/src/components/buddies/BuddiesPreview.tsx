import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { useBuddyStore } from '../../state/useBuddyStore';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { buddyName, buddyStreakLabel } from './buddyCopy';

/** Profile section: top 3 buddies (or a gentle invite) → Buddies screen. */
export default function BuddiesPreview() {
  const navigation = useNavigation<any>();
  const data = useBuddyStore((s) => s.data);
  const status = useBuddyStore((s) => s.status);
  const load = useBuddyStore((s) => s.load);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (status === 'unavailable' || !data) return null;
  const top = data.buddies.slice(0, 3);
  const invites = data.invites_in.length;
  const open = () => navigateFromRoot(navigation, 'Buddies');

  return (
    <PressableScale
      onPress={open}
      feedback={false}
      accessibilityRole="button"
      accessibilityLabel={
        top.length
          ? `Path buddies: ${top.map((b) => `${buddyName(b.user)}, ${buddyStreakLabel(b.streak)}`).join('; ')}`
          : 'Path buddies. Grow with a friend'
      }
      style={tw`mt-3 bg-card border border-line/80 rounded-card px-4 py-3.5`}
    >
      <View style={tw`flex-row items-center`}>
        <Text style={tw`flex-1 text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
          Path buddies
        </Text>
        {invites > 0 ? (
          <View style={tw`px-2 py-0.5 rounded-chip bg-emerald-600 mr-2`}>
            <Text style={tw`text-caption font-semibold text-white`}>
              {invites} {invites === 1 ? 'invite' : 'invites'}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
      </View>
      {top.length ? (
        <View style={tw`mt-2.5 gap-2`}>
          {top.map((b) => (
            <View key={b.id} style={tw`flex-row items-center`}>
              <GrowAvatar userId={b.user.id} username={b.user.username} uri={b.user.avatar_url} size={28} />
              <Text style={tw`flex-1 ml-2.5 text-footnote font-semibold text-ink`} numberOfLines={1}>
                {buddyName(b.user)}
              </Text>
              <Ionicons name="leaf-outline" size={13} color={theme.colors.leafInk} />
              <Text style={tw`ml-1 text-xs text-ink-2`}>{buddyStreakLabel(b.streak)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={tw`mt-1.5 text-sm text-ink-2`}>Grow with a friend — pick someone from your circle.</Text>
      )}
    </PressableScale>
  );
}
