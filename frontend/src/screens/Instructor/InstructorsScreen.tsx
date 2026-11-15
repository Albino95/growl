import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { iconSize } from '../../theme/icons';
import { useRefresh } from '../../hooks/useRefresh';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import { StarRow } from '../../components/instructor/StarRating';
import {
  formatOfferLine,
  listInstructors,
  type DiscoverInstructor,
} from '../../services/api/instructor';
import { useAuth } from '../../store/hooks';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { openCoachingReachOut } from '../../utils/coachingReachOut';
import { getRootNavigator, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { TAB_SCREEN_BOTTOM_PADDING, horizontalScrollProps } from '../../constants/scroll';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';
import {
  applyDiscoveryFilter,
  DISCOVERY_FILTERS,
  isNewCoach,
  type DiscoveryFilter,
} from '../../components/instructor/discoveryFilters';

export default function InstructorsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [items, setItems] = useState<DiscoverInstructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const serverPaths = filter === 'paths';

  const load = useCallback(async () => {
    try {
      const list = await listInstructors({ limit: 40, forPaths: serverPaths });
      setItems(list);
      setLoadError(null);
    } catch (e) {
      // Keep any list we already have; the empty state shows the error + retry.
      setLoadError(e instanceof Error ? e.message : 'Could not load instructors');
    } finally {
      setLoading(false);
    }
  }, [serverPaths]);
  const shown = useMemo(() => applyDiscoveryFilter(items, filter), [items, filter]);
  const refresh = useRefresh(load);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onReachOut = async (person: DiscoverInstructor) => {
    setBusyId(person.id);
    try {
      await openCoachingReachOut(
        navigation,
        person.id,
        `Hi ${person.username} — I’d like to talk about a coaching plan.`
      );
      feedback.send();
    } catch (e) {
      alertMessage('Reach out', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={iconSize.sm} color={theme.colors.ink} />
          </PressableScale>
        }
        right={
          user?.isInstructor ? (
            <PressableScale
              onPress={() =>
                getRootNavigator(navigation)?.navigate('Individual', { screen: 'Instructor' })
              }
              accessibilityRole="button"
              accessibilityLabel="Open your Instructor Hub"
              style={tw`px-3 h-9 rounded-full bg-emerald-600 items-center justify-center`}
            >
              <Text style={tw`text-white text-xs font-bold`}>Hub</Text>
            </PressableScale>
          ) : undefined
        }
      />

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
        refreshControl={
          <RefreshControl {...refresh} />
        }
        ListHeaderComponent={
          <FadeInUp>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-3`}>
              Instructors
            </Text>
            <Text style={tw`text-2xl font-bold text-ink mt-0.5`}>Find a coach</Text>
            <Text style={tw`text-sm text-ink-3 mt-1.5 leading-5`}>
              Talk first. Then a written weekly plan. Reviews open after 4 completed weeks together.
            </Text>
            <Text style={tw`text-xs text-ink-3 mt-1 mb-3 leading-4`}>{COACHING_BILLING_NOTE}</Text>
            <ScrollView
              {...horizontalScrollProps}
              style={tw`-mx-5 mb-3`}
              contentContainerStyle={tw`px-5`}
              accessibilityRole="tablist"
            >
              {DISCOVERY_FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <PressableScale
                    key={f.key}
                    onPress={() => {
                      if (on) return;
                      if ((f.key === 'paths') !== serverPaths) setLoading(true);
                      setFilter(f.key);
                    }}
                    feedback="chip"
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={tw`mr-2 px-3.5 py-2 rounded-chip border ${
                      on ? 'bg-emerald-600 border-emerald-600' : 'bg-raised border-line'
                    }`}
                  >
                    <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>
                      {f.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
            {user?.isInstructor ? (
              <PressableScale
                onPress={() =>
                  getRootNavigator(navigation)?.navigate('Individual', { screen: 'Instructor' })
                }
                style={tw`mb-4 px-4 py-3.5 rounded-card bg-emerald-50 border border-emerald-100 flex-row items-center`}
              >
                <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                  <Ionicons name="school" size={16} color="#fff" />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`font-bold text-ink`}>Your Instructor Hub</Text>
                  <Text style={tw`text-xs text-ink-3 mt-0.5`}>Students, offer, homework</Text>
                </View>
                <Ionicons name="chevron-forward" size={iconSize.sm} color={theme.colors.iconMuted} />
              </PressableScale>
            ) : null}
          </FadeInUp>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList variant="inbox" count={4} />
          ) : loadError ? (
            <ErrorState
              title="Couldn’t load instructors"
              message={loadError}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
            />
          ) : filter !== 'all' && items.length > 0 ? (
            <EmptyState
              icon="funnel-outline"
              title="No coaches match"
              description="Try another filter — new coaches appear as people on your paths claim instructor."
              actionLabel="Show all"
              onAction={() => setFilter('all')}
            />
          ) : (
            <EmptyState
              icon="school-outline"
              title={filter === 'paths' ? 'No coaches on your paths yet' : 'No instructors yet'}
              description="Peer-endorsed coaches will show here. Ask someone on your path to claim instructor."
              actionLabel={filter !== 'all' ? 'Show all' : undefined}
              onAction={filter !== 'all' ? () => setFilter('all') : undefined}
            />
          )
        }
        renderItem={({ item, index }) => {
          const path =
            (item.shared_categories[0] && getCategoryLabel(item.shared_categories[0])) ||
            (item.categories[0] && getCategoryLabel(item.categories[0])) ||
            'Coach';
          const offer = formatOfferLine(item);
          const paused = item.accepting === false;
          const fresh = isNewCoach(item);
          return (
            <FadeInUp delay={Math.min(index * 40, 160)}>
              <PressableScale
                onPress={() => navigateFromRoot(navigation, 'PublicProfile', { userId: item.id, preview: { username: item.username, avatarUrl: item.avatar } })}
                accessibilityRole="button"
                accessibilityLabel={`${item.username}, ${item.teaching_headline || `teaching ${path}`}${
                  item.rating_count && item.rating_avg ? `, rated ${item.rating_avg} from ${item.rating_count}` : ''
                }${paused ? ', not taking new plans' : ''}. Open profile`}
                style={tw`mb-3 px-4 py-4 rounded-sheet bg-card border border-line/80`}
              >
                <View style={tw`flex-row items-center`}>
                  <GrowAvatar
                    userId={item.id}
                    username={item.username}
                    uri={item.avatar}
                    size={56}
                    style={tw`mr-3`}
                  />
                  <View style={tw`flex-1`}>
                    <View style={tw`flex-row items-center`}>
                      <Text style={tw`text-lg font-bold text-ink flex-shrink`} numberOfLines={1}>
                        {item.username}
                      </Text>
                      {fresh ? (
                        <View style={tw`ml-2 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100`}>
                          <Text style={tw`text-caption font-semibold text-emerald-800`}>New</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={tw`text-footnote text-ink-3 mt-0.5`} numberOfLines={2}>
                      {item.teaching_headline || `Teaching ${path}`}
                    </Text>
                    {item.rating_count && item.rating_avg ? (
                      <View style={tw`flex-row items-center mt-1.5`}>
                        <StarRow value={item.rating_avg} />
                        <Text style={tw`text-xs text-ink-3 ml-1.5`}>
                          {item.rating_avg} · {item.rating_count}
                        </Text>
                      </View>
                    ) : (
                      <Text style={tw`text-caption text-ink-3 mt-1`}>
                        Reviews after 4 completed weeks
                      </Text>
                    )}
                  </View>
                </View>
                <View style={tw`flex-row items-center justify-between mt-3`}>
                  <Text
                    style={tw`text-footnote font-semibold flex-1 ${paused ? 'text-ink-3' : 'text-emerald-800'}`}
                    numberOfLines={1}
                  >
                    {paused ? 'Not taking new plans right now' : offer || path}
                  </Text>
                  <PressableScale
                    onPress={() => void onReachOut(item)}
                    disabled={busyId === item.id || paused}
                    accessibilityRole="button"
                    accessibilityLabel={paused ? `${item.username} is paused` : `Reach out to ${item.username}`}
                    accessibilityState={{ disabled: busyId === item.id || paused, busy: busyId === item.id }}
                    style={tw`ml-2 px-3 py-2 rounded-control ${paused ? 'bg-raised border border-line' : 'bg-emerald-600'}`}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={tw`text-xs font-bold ${paused ? 'text-ink-3' : 'text-white'}`}>
                        {paused ? 'Paused' : 'Reach out'}
                      </Text>
                    )}
                  </PressableScale>
                </View>
              </PressableScale>
            </FadeInUp>
          );
        }}
      />
    </SafeAreaView>
  );
}
