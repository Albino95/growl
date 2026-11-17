import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import CohortCard from '../../components/cohorts/CohortCard';
import CohortCreateSheet from '../../components/cohorts/CohortCreateSheet';
import CohortJoinSheet from '../../components/cohorts/CohortJoinSheet';
import { personName } from '../../components/cohorts/cohortCopy';
import {
  declineCohortInvite,
  joinCohort,
  listCohorts,
  type CohortInvite,
  type CohortsPayload,
} from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';
import { useAuth } from '../../store/hooks';
import { useRefresh } from '../../hooks/useRefresh';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';

type Params = { code?: string } | undefined;

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={tw`mb-5`}>
      <View style={tw`flex-row items-center mb-2 px-1`}>
        <Text style={tw`flex-1 text-caption font-semibold tracking-widest text-ink-3 uppercase`}>{title}</Text>
        {right}
      </View>
      <View style={tw`gap-2`}>{children}</View>
    </View>
  );
}

/** Groups hub: groups you coach, groups you're in, invites, join with a code. */
export default function CohortsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const initialCode = (route.params as Params)?.code ?? null;
  const { user } = useAuth();
  const isInstructor = !!user?.isInstructor;

  const [data, setData] = useState<CohortsPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(!!initialCode);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listCohorts());
      setState('ready');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? 'unavailable' : 'error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  useEffect(() => {
    if (initialCode) setJoining(true);
  }, [initialCode]);
  const refresh = useRefresh(load);

  const open = (id: string) => navigation.navigate('CohortDetail', { cohortId: id });

  const accept = async (inv: CohortInvite) => {
    setBusyInvite(inv.cohort.id);
    try {
      await joinCohort({ cohort_id: inv.cohort.id });
      haptic('success');
      toast.success(`You joined ${inv.cohort.title}`);
      open(inv.cohort.id);
      void load();
    } catch (e) {
      void alertMessage('Couldn’t join', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusyInvite(null);
    }
  };

  const decline = async (inv: CohortInvite) => {
    setBusyInvite(inv.cohort.id);
    try {
      await declineCohortInvite(inv.cohort.id);
      setData((d) => (d ? { ...d, invites: d.invites.filter((x) => x.cohort.id !== inv.cohort.id) } : d));
    } catch {
      toast.info('Couldn’t update just now');
    } finally {
      setBusyInvite(null);
    }
  };

  const header = <ScreenHeader title="Groups" onBack={() => navigation.goBack()} backIcon="arrow-back" />;

  if (state === 'unavailable') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <EmptyState icon="people-outline" title="Groups are almost here" description="Group plans arrive in an update soon." />
      </SafeAreaView>
    );
  }

  const coaching = data?.coaching ?? [];
  const member = data?.member ?? [];
  const invites = data?.invites ?? [];

  const joinButton = (
    <PressableScale
      feedback="open"
      onPress={() => setJoining(true)}
      accessibilityRole="button"
      accessibilityLabel="Join a group with a code"
      style={tw`flex-row items-center justify-center py-3 rounded-control bg-raised`}
    >
      <Ionicons name="key-outline" size={17} color={theme.colors.ink} />
      <Text style={tw`ml-2 text-body font-semibold text-ink`}>Join with a code</Text>
    </PressableScale>
  );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      {!data && state === 'loading' ? (
        <View style={tw`px-gutter pt-3`}>
          <SkeletonList variant="inbox" count={3} />
        </View>
      ) : !data ? (
        <ErrorState
          compact
          icon="people-outline"
          title="Your groups are still loading"
          message="We couldn’t reach them just now."
          onRetry={() => void load()}
          style={tw`px-8 mt-16`}
        />
      ) : (
        <ScrollView contentContainerStyle={tw`px-gutter pt-3 pb-16`} refreshControl={<RefreshControl {...refresh} />}>
          {invites.length ? (
            <Section title="Invites for you">
              {invites.map((inv) => (
                <View key={inv.cohort.id} style={tw`bg-card border border-emerald-100 rounded-card px-4 py-3`}>
                  <View style={tw`flex-row items-center`}>
                    <GrowAvatar
                      userId={inv.cohort.coach.id}
                      username={inv.cohort.coach.username}
                      uri={inv.cohort.coach.avatar_url}
                      size={36}
                    />
                    <Text style={tw`flex-1 ml-3 text-body text-ink`} numberOfLines={2}>
                      <Text style={tw`font-semibold`}>{personName(inv.cohort.coach)}</Text> invited you to{' '}
                      <Text style={tw`font-semibold`}>{inv.cohort.title}</Text>
                    </Text>
                  </View>
                  {inv.cohort.description ? (
                    <Text style={tw`text-footnote text-ink-2 mt-2`} numberOfLines={3}>
                      {inv.cohort.description}
                    </Text>
                  ) : null}
                  <View style={tw`flex-row gap-2 mt-3`}>
                    <PressableScale
                      feedback="commit"
                      disabled={busyInvite === inv.cohort.id}
                      onPress={() => void accept(inv)}
                      accessibilityRole="button"
                      accessibilityLabel={`Join ${inv.cohort.title}`}
                      style={tw`flex-1 py-2.5 rounded-control bg-emerald-600 items-center ${
                        busyInvite === inv.cohort.id ? 'opacity-60' : ''
                      }`}
                    >
                      <Text style={tw`text-white font-semibold text-footnote`}>Join</Text>
                    </PressableScale>
                    <PressableScale
                      feedback={false}
                      disabled={busyInvite === inv.cohort.id}
                      onPress={() => void decline(inv)}
                      accessibilityRole="button"
                      accessibilityLabel={`Decline ${inv.cohort.title}`}
                      style={tw`px-5 py-2.5 rounded-control bg-raised items-center`}
                    >
                      <Text style={tw`text-ink font-semibold text-footnote`}>Not now</Text>
                    </PressableScale>
                  </View>
                </View>
              ))}
            </Section>
          ) : null}

          {isInstructor || coaching.length ? (
            <Section
              title="Groups you coach"
              right={
                isInstructor ? (
                  <PressableScale
                    feedback="open"
                    onPress={() => setCreating(true)}
                    accessibilityRole="button"
                    accessibilityLabel="New group plan"
                    style={tw`flex-row items-center px-3 py-1.5 rounded-chip bg-emerald-600`}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={tw`ml-1 text-footnote font-semibold text-white`}>New group</Text>
                  </PressableScale>
                ) : null
              }
            >
              {coaching.length ? (
                coaching.map((c) => <CohortCard key={c.id} cohort={c} onPress={() => open(c.id)} />)
              ) : (
                <View style={tw`bg-card border border-line rounded-card px-4 py-4`}>
                  <Text style={tw`text-body font-semibold text-ink`}>Coach many people at once</Text>
                  <Text style={tw`text-footnote text-ink-2 mt-1 leading-5`}>
                    A group plan is one program for 2–150 people: post an update once, assign homework to everyone, and
                    see who might need you this week.
                  </Text>
                  <Text style={tw`text-footnote text-ink-3 mt-2`}>{COACHING_BILLING_NOTE}</Text>
                </View>
              )}
            </Section>
          ) : null}

          <Section title="Your groups">
            {member.length ? (
              member.map((c) => <CohortCard key={c.id} cohort={c} onPress={() => open(c.id)} />)
            ) : (
              <Text style={tw`text-footnote text-ink-3 px-1`}>
                When a coach invites you or shares a code, your groups show up here.
              </Text>
            )}
          </Section>
          {joinButton}
        </ScrollView>
      )}

      <CohortCreateSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          toast.success('Group created — invite people next');
          void load();
          navigation.navigate('CohortDetail', { cohortId: c.id, invite: true });
        }}
      />
      <CohortJoinSheet
        visible={joining}
        onClose={() => setJoining(false)}
        initialCode={initialCode}
        onJoined={(d) => {
          setJoining(false);
          void load();
          open(d.cohort.id);
        }}
      />
    </SafeAreaView>
  );
}
