import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getCoachQueue } from '../../services/api/coachq';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';

/**
 * Instructor Hub entry to the coach's Today queue with a red-count badge.
 * Hidden until the coach has an active client (or when the backend has no queue).
 */
export default function CoachTodayEntry() {
  const navigation = useNavigation();
  const [counts, setCounts] = useState<{ red: number; amber: number; active: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getCoachQueue()
        .then((q) => {
          if (!alive) return;
          setCounts(q ? { red: q.counts.red, amber: q.counts.amber, active: q.active_clients ?? q.clients.length } : null);
        })
        .catch(() => {
          /* entry is optional; keep the last known counts */
        });
      return () => {
        alive = false;
      };
    }, [])
  );

  if (!counts || counts.active === 0) return null;

  const subtitle = counts.red
    ? `${counts.red} need${counts.red === 1 ? 's' : ''} you today`
    : counts.amber
      ? `${counts.amber} to check this week`
      : 'Everyone’s on track';

  return (
    <PressableScale
      onPress={() => navigateFromRoot(navigation, 'CoachToday')}
      feedback="open"
      accessibilityRole="button"
      accessibilityLabel={`Today. ${subtitle}. ${counts.active} active clients`}
      style={tw`mx-gutter-wide mt-3 px-4 py-3 rounded-card bg-card border border-line/80 flex-row items-center`}
    >
      <View style={tw`w-9 h-9 rounded-full bg-emerald-50 items-center justify-center`}>
        <Ionicons name="today-outline" size={18} color={tw.color('emerald-700')} />
      </View>
      <View style={tw`flex-1 ml-3`}>
        <Text style={tw`text-callout font-bold text-ink`}>Today</Text>
        <Text style={tw`text-footnote text-ink-3`}>
          {subtitle} · {counts.active} active
        </Text>
      </View>
      {counts.red ? (
        <View style={tw`min-w-6 h-6 px-1.5 rounded-full bg-rose-600 items-center justify-center mr-2`}>
          <Text style={tw`text-caption font-bold text-white`}>{counts.red > 99 ? '99+' : counts.red}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
    </PressableScale>
  );
}
