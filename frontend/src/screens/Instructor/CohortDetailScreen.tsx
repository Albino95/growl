import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import GrowAvatar from '../../components/ui/GrowAvatar';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import CohortUpdatesTab from '../../components/cohorts/CohortUpdatesTab';
import CohortHomeworkTab from '../../components/cohorts/CohortHomeworkTab';
import CohortMembersTab from '../../components/cohorts/CohortMembersTab';
import CohortProgressTab from '../../components/cohorts/CohortProgressTab';
import CohortInviteSheet from '../../components/cohorts/CohortInviteSheet';
import { pathLabel } from '../../components/cohorts/CohortCard';
import { membersLabel, personName, weekLabel } from '../../components/cohorts/cohortCopy';
import {
  declineCohortInvite,
  getCohort,
  joinCohort,
  leaveCohort,
  updateCohort,
  type CohortDetail,
} from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { COACHING_BILLING_NOTE } from '../../constants/coaching';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';

type Params = { cohortId: string; invite?: boolean };
type Tab = 'updates' | 'homework' | 'members' | 'progress';

const COACH_TABS: { key: Tab; label: string }[] = [
  { key: 'updates', label: 'Updates' },
  { key: 'homework', label: 'Homework' },
  { key: 'members', label: 'Members' },
  { key: 'progress', label: 'Progress' },
];
const MEMBER_TABS: { key: Tab; label: string }[] = [
  { key: 'updates', label: 'Updates' },
  { key: 'homework', label: 'My homework' },
  { key: 'members', label: 'Members' },
];

/** One group: Updates · Homework · Members · Progress (coach) / member view. */
export default function CohortDetailScreen() {
  const navigation = useNavigation<any>();
  const params = useRoute().params as Params;
  const cohortId = params?.cohortId;
  const [detail, setDetail] = useState<CohortDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'gone'>('loading');
  const [tab, setTab] = useState<Tab>('updates');
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cohortId) return;
    try {
      setDetail(await getCohort(cohortId));
      setState('ready');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? 'gone' : 'error');
    }
  }, [cohortId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params?.invite && detail?.cohort.role === 'coach') setInviting(true);
  }, [params?.invite, detail?.cohort.role]);

  const header = (right?: React.ReactNode) => (
    <ScreenHeader title={detail?.cohort.title ?? 'Group'} onBack={() => navigation.goBack()} backIcon="arrow-back" rightAction={right} />
  );

  if (state === 'gone') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header()}
        <EmptyState icon="people-outline" title="This group isn’t available" description="It may have been archived, or you’re no longer a member." />
      </SafeAreaView>
    );
  }
  if (!detail) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header()}
        {state === 'error' ? (
          <ErrorState compact title="The group is still loading" message="We couldn’t reach it just now." onRetry={() => void load()} style={tw`px-8 mt-16`} />
        ) : (
          <View style={tw`px-gutter pt-3`}>
            <SkeletonList variant="post" count={2} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  const { cohort } = detail;
  const isCoach = cohort.role === 'coach';

  // Invited (not a member yet): a gentle preview with Join / Not now.
  if (cohort.role === 'invited') {
    const join = async () => {
      setBusy(true);
      try {
        setDetail(await joinCohort({ cohort_id: cohort.id }));
        haptic('success');
        toast.success(`Welcome to ${cohort.title}`);
      } catch (e) {
        void alertMessage('Couldn’t join', e instanceof ApiError ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    };
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header()}
        <View style={tw`px-gutter pt-4`}>
          <View style={tw`bg-card border border-line rounded-card px-4 py-4`}>
            <View style={tw`flex-row items-center`}>
              <GrowAvatar userId={cohort.coach.id} username={cohort.coach.username} uri={cohort.coach.avatar_url} size={40} />
              <View style={tw`flex-1 ml-3`}>
                <Text style={tw`text-callout font-bold text-ink`}>{cohort.title}</Text>
                <Text style={tw`text-footnote text-ink-2`}>with {personName(cohort.coach)}</Text>
              </View>
            </View>
            <Text style={tw`text-footnote text-ink-3 mt-3`}>
              {[weekLabel(cohort), pathLabel(cohort.path), membersLabel(cohort)].filter(Boolean).join(' · ')}
            </Text>
            {cohort.description ? <Text style={tw`text-body text-ink-2 mt-2 leading-6`}>{cohort.description}</Text> : null}
            <Text style={tw`text-footnote text-ink-3 mt-3 leading-5`}>
              Members see your name and photo. Your homework and check-ins stay between you and the coach.
            </Text>
            <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>{COACHING_BILLING_NOTE}</Text>
          </View>
          <PrimaryButton label="Join group" loading={busy} disabled={cohort.spots_left <= 0} onPress={() => void join()} style={tw`mt-4`} />
          <PressableScale
            onPress={() => {
              void declineCohortInvite(cohort.id).finally(() => navigation.goBack());
            }}
            accessibilityRole="button"
            style={tw`mt-2 py-3 items-center`}
          >
            <Text style={tw`text-body font-semibold text-ink-2`}>Not now</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const tabs = isCoach ? COACH_TABS : MEMBER_TABS;

  const leave = async () => {
    const ok = await confirmAsync(
      `Leave ${cohort.title}?`,
      'You stop getting updates and group homework. You can come back with the code while there’s space.',
      { confirmLabel: 'Leave', cancelLabel: 'Stay', destructive: true }
    );
    if (!ok) return;
    try {
      await leaveCohort(cohort.id);
      toast.info(`You left ${cohort.title}`);
      navigation.goBack();
    } catch (e) {
      void alertMessage('Couldn’t leave', e instanceof ApiError ? e.message : undefined);
    }
  };

  const toggleArchive = async () => {
    const archiving = cohort.status === 'active';
    const ok = await confirmAsync(
      archiving ? 'Archive this group?' : 'Reopen this group?',
      archiving
        ? 'Members can still read past updates, but no new posts, homework or joins.'
        : 'Members can post replies and get homework again.',
      { confirmLabel: archiving ? 'Archive' : 'Reopen' }
    );
    if (!ok) return;
    try {
      setDetail(await updateCohort(cohort.id, { status: archiving ? 'archived' : 'active' }));
      haptic('success');
    } catch (e) {
      void alertMessage('Couldn’t update', e instanceof ApiError ? e.message : undefined);
    }
  };

  const right = isCoach ? (
    <View style={tw`flex-row items-center gap-1`}>
      {cohort.status === 'active' ? (
        <PressableScale
          feedback="open"
          onPress={() => setInviting(true)}
          accessibilityRole="button"
          accessibilityLabel="Invite people"
          style={tw`p-2`}
        >
          <Ionicons name="person-add-outline" size={21} color={theme.colors.ink} />
        </PressableScale>
      ) : null}
      <PressableScale
        onPress={() => void toggleArchive()}
        accessibilityRole="button"
        accessibilityLabel={cohort.status === 'active' ? 'Archive group' : 'Reopen group'}
        style={tw`p-2`}
      >
        <Ionicons name={cohort.status === 'active' ? 'archive-outline' : 'refresh'} size={21} color={theme.colors.ink} />
      </PressableScale>
    </View>
  ) : undefined;

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header(right)}
      <View style={tw`px-gutter pb-2`}>
        <Text style={tw`text-footnote text-ink-3`}>
          {[weekLabel(cohort), pathLabel(cohort.path), isCoach ? membersLabel(cohort) : `with ${personName(cohort.coach)}`]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {!isCoach && detail.mine && detail.mine.total ? (
          <Text style={tw`text-footnote text-ink-2 mt-0.5`}>
            You: {detail.mine.done} of {detail.mine.total} done · Group: {detail.group?.completion_pct ?? 0}%
          </Text>
        ) : null}
      </View>
      <View style={tw`flex-row border-b border-line px-gutter`} accessibilityRole="tablist">
        {tabs.map((t) => {
          const on = tab === t.key;
          return (
            <PressableScale
              key={t.key}
              feedback={on ? false : 'chip'}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={tw`mr-5 pb-2.5 pt-1 border-b-2 ${on ? 'border-emerald-600' : 'border-transparent'}`}
            >
              <Text style={tw`text-footnote font-semibold ${on ? 'text-emerald-700' : 'text-ink-3'}`}>{t.label}</Text>
            </PressableScale>
          );
        })}
      </View>
      <View style={tw`flex-1`}>
        {tab === 'updates' ? <CohortUpdatesTab cohort={cohort} /> : null}
        {tab === 'homework' ? <CohortHomeworkTab cohort={cohort} onChanged={() => void load()} /> : null}
        {tab === 'members' ? (
          <CohortMembersTab detail={detail} reload={load} onInvite={() => setInviting(true)} onLeave={() => void leave()} />
        ) : null}
        {tab === 'progress' && isCoach ? <CohortProgressTab cohort={cohort} /> : null}
      </View>

      {isCoach ? (
        <CohortInviteSheet
          visible={inviting}
          onClose={() => setInviting(false)}
          cohort={cohort}
          onCodeChanged={(code, link) =>
            setDetail((d) => (d ? { ...d, cohort: { ...d.cohort, invite_code: code, invite_link: link } } : d))
          }
        />
      ) : null}
    </SafeAreaView>
  );
}
