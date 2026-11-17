import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { getCircleWeek, type CircleWeek } from '../../services/api/circleWeek';
import { getLocalItem, setLocalItem } from '../../services/storage/localStore';
import { useGrowthStore } from '../../state/useGrowthStore';
import { useAppSelector } from '../../store/hooks';
import { usePublishQueue } from '../../state/usePublishQueue';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  circleWeekHeadline,
  circleWeekSubline,
  daysLabel,
  isCircleWeekDay,
  shouldShowCircleWeek,
} from './circleWeekMeta';

const DISMISS_KEY = 'grow.circleWeek.dismissedWeekStart';

/**
 * Sunday circle recap on Home: "share one moment to see everyone's week".
 * Counts for everyone; faces + friends' shared pages once you've shared one.
 * Self-contained (own fetch, Sunday only) so the Feed header memo needs no deps.
 * Hidden when the server doesn't have the endpoint (404) or you have no friends.
 */
function CircleWeekCard() {
  const navigation = useNavigation<any>();
  const [week, setWeek] = useState<CircleWeek | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const sunday = isCircleWeekDay();
  // Refetch after you journal or a post finishes publishing (that may unlock the card).
  // Newest journal entry id + whether it's shared: changes when you write or share a page.
  const lastJournal = useAppSelector((s) => {
    const e = s.journal.entries[0];
    return e ? `${e.id}:${(e.isPublic ?? e.is_public) ? 1 : 0}` : '';
  });
  const lastSharedAt = usePublishQueue((s) => s.lastSharedAt);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  useEffect(() => {
    if (!sunday) return;
    void getLocalItem(DISMISS_KEY).then((v) => {
      if (mounted.current) setDismissed(v);
    });
  }, [sunday]);

  const load = useCallback(() => {
    getCircleWeek()
      .then((w) => {
        if (mounted.current) setWeek(w);
      })
      .catch(() => {
        /* keep last good; the card is optional */
      });
  }, []);

  useEffect(() => {
    if (sunday) load();
  }, [sunday, load, lastJournal, lastSharedAt]);

  if (!shouldShowCircleWeek(week, dismissed) || !week) return null;

  const dismiss = () => {
    setDismissed(week.week_start);
    void setLocalItem(DISMISS_KEY, week.week_start);
  };

  const shareMoment = () => {
    useGrowthStore.getState().setComposeDraft({
      mood: null,
      path: null,
      intention: null,
      share: true,
      prompt: 'One moment from your week, for your circle',
    });
    navigation.navigate('Journal', { openCompose: true });
  };

  const openProfile = (userId: string, username: string, avatar: string | null) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId, preview: { username, avatarUrl: avatar } });
  };

  const headline = circleWeekHeadline(week);
  const subline = circleWeekSubline(week);

  return (
    <View style={tw`mx-gutter mb-3 px-4 pt-4 pb-4 rounded-sheet bg-card border border-line`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-caption tracking-[2px] uppercase text-emerald-700 font-semibold`}>
            Sunday · your circle
          </Text>
          <Text accessibilityRole="header" style={tw`text-callout font-bold text-ink mt-0.5`}>
            {headline}
          </Text>
          <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>{subline}</Text>
        </View>
        <PressableScale
          feedback="close"
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide your circle’s week"
        >
          <Ionicons name="close" size={18} color={theme.colors.iconMuted} />
        </PressableScale>
      </View>

      {!week.shared ? (
        <PressableScale
          feedback="open"
          onPress={shareMoment}
          accessibilityRole="button"
          accessibilityHint="Opens a journal page shared with your circle"
          style={tw`mt-3 self-start px-4 py-2.5 rounded-full bg-emerald-600 flex-row items-center gap-1.5`}
        >
          <Ionicons name="sparkles-outline" size={15} color="#FFFFFF" />
          <Text style={tw`text-white font-semibold text-footnote`}>Share one moment</Text>
        </PressableScale>
      ) : (
        <>
          {week.members.length > 0 ? (
            <View style={tw`flex-row flex-wrap gap-3 mt-3`}>
              {week.members.map((m) => (
                <PressableScale
                  key={m.id}
                  onPress={() => openProfile(m.id, m.display_name, m.avatar)}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.display_name}, ${daysLabel(m.days)} this week`}
                  style={tw`items-center w-14`}
                >
                  <GrowAvatar userId={m.id} username={m.display_name} uri={m.avatar} size={40} />
                  <Text style={tw`text-caption text-ink-2 mt-1`} numberOfLines={1}>
                    {m.display_name}
                  </Text>
                  <Text style={tw`text-caption text-ink-3`}>{daysLabel(m.days)}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
          {week.moments.length > 0 ? (
            <View style={tw`mt-3 gap-2`}>
              {week.moments.map((mo) => (
                <PressableScale
                  key={mo.id}
                  onPress={() => openProfile(mo.user_id, mo.display_name, mo.avatar)}
                  accessibilityRole="button"
                  accessibilityLabel={`${mo.display_name} shared: ${mo.excerpt}`}
                  style={tw`flex-row items-start px-3 py-2.5 rounded-card bg-raised`}
                >
                  <GrowAvatar userId={mo.user_id} username={mo.display_name} uri={mo.avatar} size={24} />
                  <View style={tw`flex-1 ml-2`}>
                    <Text style={tw`text-footnote font-semibold text-ink`} numberOfLines={1}>
                      {mo.display_name}
                    </Text>
                    <Text style={tw`text-footnote text-ink-2 leading-5`} numberOfLines={2}>
                      {mo.excerpt}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          ) : (
            <Text style={tw`text-footnote text-ink-3 mt-3`}>
              No shared pages from friends yet this week — yours might be the first.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

export default React.memo(CircleWeekCard);
