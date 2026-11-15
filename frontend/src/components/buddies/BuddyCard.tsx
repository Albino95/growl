import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import BuddyPairAvatars from './BuddyPairAvatars';
import type { Buddy } from '../../services/api/buddies';
import { buddyName, buddyStreakLabel, buddyTodayLine } from './buddyCopy';

type Props = {
  buddy: Buddy;
  me: { id?: string; username?: string; avatar?: string | null } | null | undefined;
  onOpenProfile: () => void;
  onMore: () => void;
};

/** One buddy: both avatars, sprout streak, today's gentle state, milestone. */
export default function BuddyCard({ buddy, me, onOpenProfile, onMore }: Props) {
  const name = buddyName(buddy.user);
  const both = buddy.today.me && buddy.today.them;
  const todayLine = buddyTodayLine(buddy);
  const next = buddy.next_milestone;

  return (
    <View style={tw`bg-card border border-line/80 rounded-card px-4 py-3.5`}>
      <View style={tw`flex-row items-center`}>
        <PressableScale
          onPress={onOpenProfile}
          feedback={false}
          accessibilityRole="button"
          accessibilityLabel={`${name}. ${buddyStreakLabel(buddy.streak)}. ${todayLine}`}
          style={tw`flex-1 flex-row items-center`}
        >
          <BuddyPairAvatars me={me} them={buddy.user} />
          <View style={tw`flex-1 ml-3`}>
            <Text style={tw`text-body font-semibold text-ink`} numberOfLines={1}>
              {name}
            </Text>
            <View style={tw`flex-row items-center mt-0.5`}>
              <Ionicons name="leaf" size={13} color={theme.colors.leafInk} />
              <Text style={tw`ml-1 text-footnote font-semibold text-ink-2`}>{buddyStreakLabel(buddy.streak)}</Text>
              {buddy.milestone ? (
                <Text style={tw`ml-1.5 text-xs text-ink-3`} numberOfLines={1}>
                  · {buddy.milestone.name}
                </Text>
              ) : null}
            </View>
          </View>
        </PressableScale>
        <PressableScale
          onPress={onMore}
          feedback={false}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Options for ${name}`}
          style={tw`w-8 h-8 items-center justify-center`}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.iconMuted} />
        </PressableScale>
      </View>

      <View
        style={tw`mt-3 flex-row items-center px-3 py-2 rounded-control ${
          both ? 'bg-emerald-50 border border-emerald-100' : 'bg-raised'
        }`}
      >
        <View style={tw`flex-row mr-2 gap-1`} accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={tw`w-2 h-2 rounded-full ${buddy.today.me ? 'bg-emerald-600' : 'bg-stone-300'}`} />
          <View style={tw`w-2 h-2 rounded-full ${buddy.today.them ? 'bg-emerald-600' : 'bg-stone-300'}`} />
        </View>
        <Text style={tw`flex-1 text-xs ${both ? 'text-emerald-900 font-semibold' : 'text-ink-2'}`} numberOfLines={2}>
          {todayLine}
        </Text>
      </View>

      {next ? (
        <Text style={tw`mt-2 text-xs text-ink-3`}>
          {next.days - buddy.streak} more shared {next.days - buddy.streak === 1 ? 'day' : 'days'} to {next.name}
          {buddy.best > buddy.streak ? ` · best ${buddy.best}` : ''}
        </Text>
      ) : buddy.best > 0 ? (
        <Text style={tw`mt-2 text-xs text-ink-3`}>Best run {buddy.best} days</Text>
      ) : null}
    </View>
  );
}
