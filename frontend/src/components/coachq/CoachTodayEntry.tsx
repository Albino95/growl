import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { getCoachQueue, getReviewItems } from '../../services/api/coachq';
import { todayEntrySummary } from './queueFormat';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';

/**
 * Instructor Hub entry to the coach's Today queue with a red-count badge.
 * Hidden until the coach has an active client (or when the backend has no queue).
 */
export default function CoachTodayEntry() {
  const navigation = useNavigation();
  const [counts, setCounts] = useState<{ red: number; amber: number; active: number; review: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // The queue has no review count: ask the review list for its total alongside.
      Promise.all([getCoachQueue(), getReviewItems().catch(() => null)])
        .then(([q, review]) => {
          if (!alive) return;
          setCounts(
            q
              ? {
                  red: q.counts.red,
                  amber: q.counts.amber,
                  active: q.active_clients ?? q.clients.length,
                  review: review?.total ?? review?.items.length ?? 0,
                }
              : null
          );
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

  const { subtitle, badge, badgeTone } = todayEntrySummary(counts);

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
      {badge ? (
        <View
          style={tw`min-w-6 h-6 px-1.5 rounded-full ${
            badgeTone === 'red' ? 'bg-rose-600' : 'bg-emerald-600'
          } items-center justify-center mr-2`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={tw`text-caption font-bold text-white`}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
    </PressableScale>
  );
}
