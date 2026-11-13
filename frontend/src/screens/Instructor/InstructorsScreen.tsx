import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
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
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';

export default function InstructorsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [items, setItems] = useState<DiscoverInstructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listInstructors({ limit: 40, forPaths: false });
      setItems(list);
      setLoadError(null);
    } catch (e) {
      // Keep any list we already have; the empty state shows the error + retry.
      setLoadError(e instanceof Error ? e.message : 'Could not load instructors');
    } finally {
      setLoading(false);
    }
  }, []);
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
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={iconSize.sm} color="#1C1917" />
          </PressableScale>
        }
        right={
          user?.isInstructor ? (
            <PressableScale
              onPress={() =>
                getRootNavigator(navigation)?.navigate('Individual', { screen: 'Instructor' })
              }
              style={tw`px-3 h-9 rounded-full bg-emerald-600 items-center justify-center`}
            >
              <Text style={tw`text-white text-xs font-bold`}>Hub</Text>
            </PressableScale>
          ) : undefined
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
        refreshControl={
          <RefreshControl {...refresh} />
        }
        ListHeaderComponent={
          <FadeInUp>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mt-3`}>
              Instructors
            </Text>
            <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>Find a coach</Text>
            <Text style={tw`text-sm text-stone-500 mt-1.5 mb-4 leading-5`}>
              Talk first. Then a written weekly plan. Reviews open after 4 completed weeks together.
            </Text>
            {user?.isInstructor ? (
              <PressableScale
                onPress={() =>
                  getRootNavigator(navigation)?.navigate('Individual', { screen: 'Instructor' })
                }
                style={tw`mb-4 px-4 py-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 flex-row items-center`}
              >
                <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                  <Ionicons name="school" size={16} color="#fff" />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`font-bold text-stone-900`}>Your Instructor Hub</Text>
                  <Text style={tw`text-xs text-stone-500 mt-0.5`}>Students, offer, homework</Text>
                </View>
                <Ionicons name="chevron-forward" size={iconSize.sm} color="#A8A29E" />
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
          ) : (
            <EmptyState
              icon="school-outline"
              title="No instructors yet"
              description="Peer-endorsed coaches will show here. Ask someone on your path to claim instructor."
            />
          )
        }
        renderItem={({ item, index }) => {
          const path =
            (item.shared_categories[0] && getCategoryLabel(item.shared_categories[0])) ||
            (item.categories[0] && getCategoryLabel(item.categories[0])) ||
            'Coach';
          const offer = formatOfferLine(item);
          return (
            <FadeInUp delay={Math.min(index * 40, 160)}>
              <PressableScale
                onPress={() => navigateFromRoot(navigation, 'PublicProfile', { userId: item.id, preview: { username: item.username, avatarUrl: item.avatar } })}
                style={tw`mb-3 px-4 py-4 rounded-3xl bg-[#FFFcf7] border border-stone-200/80`}
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
                    <Text style={tw`text-lg font-bold text-stone-900`} numberOfLines={1}>
                      {item.username}
                    </Text>
                    <Text style={tw`text-[13px] text-stone-500 mt-0.5`} numberOfLines={2}>
                      {item.teaching_headline || `Teaching ${path}`}
                    </Text>
                    {item.rating_count && item.rating_avg ? (
                      <View style={tw`flex-row items-center mt-1.5`}>
                        <StarRow value={item.rating_avg} />
                        <Text style={tw`text-xs text-stone-500 ml-1.5`}>
                          {item.rating_avg} · {item.rating_count}
                        </Text>
                      </View>
                    ) : (
                      <Text style={tw`text-[11px] text-stone-500 mt-1`}>
                        Reviews after 4 completed weeks
                      </Text>
                    )}
                  </View>
                </View>
                <View style={tw`flex-row items-center justify-between mt-3`}>
                  <Text style={tw`text-[13px] font-semibold text-emerald-800 flex-1`} numberOfLines={1}>
                    {offer || path}
                  </Text>
                  <PressableScale
                    onPress={() => void onReachOut(item)}
                    disabled={busyId === item.id}
                    style={tw`ml-2 px-3 py-2 rounded-xl bg-emerald-600`}
                  >
                    {busyId === item.id ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={tw`text-white text-xs font-bold`}>Reach out</Text>
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
