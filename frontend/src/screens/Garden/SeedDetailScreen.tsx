import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { iconSize } from '../../theme/icons';
import ErrorState from '../../components/ui/ErrorState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import FadeInUp from '../../components/ui/FadeInUp';
import SeedPlantVisual from '../../components/garden/SeedPlantVisual';
import SeedCheckInSheet from '../../components/garden/SeedCheckInSheet';
import {
  acceptSeedInvite,
  getSeed,
  matureSeed,
  type GrowthSeed,
  type SeedActivity,
} from '../../services/api/seeds';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  daysSincePlanted,
  goalSchemaFor,
  metricProgress,
} from '../../components/garden/seedGoalMeta';

type Params = { SeedDetail: { seedId: string } };

export default function SeedDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Params, 'SeedDetail'>>();
  const seedId = route.params.seedId;

  const [seed, setSeed] = useState<GrowthSeed | null>(null);
  const [activity, setActivity] = useState<SeedActivity[]>([]);
  const [myStatus, setMyStatus] = useState<string>('active');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const seedRef = useRef<GrowthSeed | null>(null);
  seedRef.current = seed;

  const load = useCallback(async () => {
    try {
      const res = await getSeed(seedId);
      setSeed(res.seed);
      setActivity(res.activity);
      setMyStatus(res.my_member_status);
    } catch (e) {
      if (!seedRef.current) {
        void alertMessage('Could not load seed', e instanceof Error ? e.message : 'Try again');
      }
    } finally {
      setLoading(false);
    }
  }, [seedId]);

  useFocusEffect(
    useCallback(() => {
      // Never blank the whole screen on return-from-modal — that looked like a freeze.
      if (!seedRef.current) setLoading(true);
      void load();
    }, [load])
  );

  const onAccept = async () => {
    setBusy(true);
    try {
      const s = await acceptSeedInvite(seedId);
      setSeed(s);
      setMyStatus('active');
      feedback.success();
    } catch (e) {
      feedback.error();
      alertMessage('Could not accept', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const onMature = async () => {
    if (busy || !seed) return;
    setBusy(true);
    try {
      const s = await matureSeed(seedId);
      setSeed(s);
      feedback.success();
      alertMessage('In the Garden', 'This tree now lives in your Garden.');
      navigateFromRoot(navigation, 'Garden');
    } catch (e) {
      feedback.error();
      alertMessage('Not ready yet', e instanceof Error ? e.message : 'Keep watering');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !seed) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        <GrowChromeHeader
          leftAccessory={
            <PressableScale
              onPress={() => navigation.goBack()}
              feedback="close"
              style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            >
              <Ionicons name="arrow-back" size={iconSize.sm} color={theme.colors.ink} />
            </PressableScale>
          }
        />
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator color={theme.colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (!seed) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        <GrowChromeHeader
          leftAccessory={
            <PressableScale
              onPress={() => navigation.goBack()}
              feedback="close"
              style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
            >
              <Ionicons name="arrow-back" size={iconSize.sm} color={theme.colors.ink} />
            </PressableScale>
          }
        />
        <View style={tw`flex-1 items-center justify-center px-8`}>
          <ErrorState
            title="Couldn’t open this seed"
            message=""
            onRetry={() => {
              setLoading(true);
              void load();
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const canMature = seed.growth_score >= 50 && seed.status !== 'mature';
  const pathLabel = getCategoryLabel(`${seed.category_key}:${seed.subcategory_key}`);
  const days = seed.days_since_planted ?? daysSincePlanted(seed.planted_at);
  const schema = goalSchemaFor(seed.subcategory_key);
  const mProg =
    seed.metric_progress ??
    metricProgress(
      seed.metric_start ?? null,
      seed.metric_target ?? null,
      seed.metric_current ?? null
    );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            onPress={() => navigation.goBack()}
            feedback="close"
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={iconSize.sm} color={theme.colors.ink} />
          </PressableScale>
        }
        right={
          <PressableScale onPress={() => navigateFromRoot(navigation, 'Garden')} feedback="open">
            <Text style={tw`text-sm font-semibold text-emerald-700`}>Garden</Text>
          </PressableScale>
        }
      />

      <ScrollView
        contentContainerStyle={tw`px-gutter-wide pb-36`}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.colors.brand} />
        }
      >
        <FadeInUp style={tw`items-center pt-2 pb-4`}>
          <SeedPlantVisual
            stage={seed.stage}
            progress={seed.progress_to_mature}
            size={140}
            shared={seed.ownership === 'shared'}
            resting={seed.status === 'resting'}
            pulseKey={pulseKey}
          />
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase mt-10`}>
            {pathLabel}
          </Text>
          <Text style={tw`text-2xl font-bold text-ink mt-1 text-center`}>{seed.title}</Text>
          {seed.goal_detail ? (
            <Text style={tw`text-sm text-ink-2 mt-2 text-center leading-5 px-2`}>
              {seed.goal_detail}
            </Text>
          ) : null}
          <View style={tw`flex-row items-center mt-2 gap-2`}>
            <View style={tw`px-2.5 py-1 rounded-full bg-raised`}>
              <Text style={tw`text-caption font-bold text-ink-2`}>Day {days}</Text>
            </View>
            <Text style={tw`text-sm text-ink-3`}>
              {seed.growth_score} growth · {Math.round(seed.progress_to_mature * 100)}% to Garden
            </Text>
          </View>
        </FadeInUp>

        {seed.metric_type && seed.metric_start != null && seed.metric_target != null ? (
          <View style={tw`mb-4 p-4 rounded-card bg-card border border-line/80 overflow-hidden`}>
            <View style={tw`h-1 bg-energy-600 absolute left-0 right-0 top-0`} />
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`}>
              Goal track
            </Text>
            <Text style={tw`text-lg font-bold text-ink`}>
              {seed.metric_current ?? seed.metric_start}
              {seed.metric_unit ? ` ${seed.metric_unit}` : ''}
              <Text style={tw`text-sm font-semibold text-ink-3`}>
                {' '}
                / {seed.metric_target}
                {seed.metric_unit ? ` ${seed.metric_unit}` : ''}
              </Text>
            </Text>
            <View style={tw`h-2 rounded-full bg-raised mt-3 overflow-hidden`}>
              <View
                style={[
                  tw`h-full rounded-full bg-energy-600`,
                  { width: `${Math.round((mProg ?? 0) * 100)}%` },
                ]}
              />
            </View>
            <Text style={tw`text-xs text-ink-3 mt-2`}>
              From {seed.metric_start}
              {seed.metric_unit ? ` ${seed.metric_unit}` : ''} · photo check-ins keep it honest
            </Text>
          </View>
        ) : null}

        {seed.members.length > 0 ? (
          <View style={tw`mb-4 p-3.5 rounded-card bg-card border border-line/80`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
              Growing with
            </Text>
            {seed.members.map((m) => (
              <View key={`${m.user_id}-${m.role}`} style={tw`flex-row items-center py-1.5`}>
                <View
                  style={tw`w-8 h-8 rounded-full bg-emerald-50 items-center justify-center mr-2.5`}
                >
                  <Ionicons
                    name={
                      m.role === 'instructor'
                        ? 'school'
                        : m.role === 'witness'
                          ? 'eye-outline'
                          : 'person'
                    }
                    size={iconSize.xs}
                    color={theme.colors.brand}
                  />
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-sm font-semibold text-ink`}>{m.username}</Text>
                  <Text style={tw`text-caption text-ink-3`}>
                    {m.role}
                    {m.status === 'pending' ? ' · pending' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
          Evidence & waters
        </Text>
        {activity.length === 0 ? (
          <Text style={tw`text-sm text-ink-3 mb-4`}>
            No check-ins yet — testify with a number{schema?.requirePhoto ? ' and photo' : ''}.
          </Text>
        ) : (
          activity.slice(0, 12).map((a) => (
            <View
              key={a.id}
              style={tw`mb-2.5 p-3 rounded-card bg-card border border-line/70`}
            >
              <View style={tw`flex-row items-start`}>
                {a.photo_url ? (
                  <Image
                    source={{ uri: a.photo_url }}
                    style={tw`w-14 h-14 rounded-control mr-3 bg-raised`}
                  />
                ) : (
                  <View style={tw`w-10 h-10 rounded-control bg-emerald-50 items-center justify-center mr-3`}>
                    <Ionicons name="water-outline" size={iconSize.sm} color={theme.colors.brand} />
                  </View>
                )}
                <View style={tw`flex-1`}>
                  <Text style={tw`text-sm font-semibold text-ink`}>
                    {a.username}
                    {a.metric_value != null
                      ? ` · ${a.metric_value}${seed.metric_unit ? ` ${seed.metric_unit}` : ''}`
                      : ''}
                  </Text>
                  <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                    Day {a.days_since_plant ?? '—'} · {a.action.replace('_', ' ')}
                    {a.delta > 0 ? ` (+${a.delta})` : ''}
                  </Text>
                  {a.note ? (
                    <Text style={tw`text-sm text-ink-2 mt-1 leading-5`}>{a.note}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <View
        style={tw`absolute left-0 right-0 bottom-0 px-gutter-wide pb-8 pt-3 bg-page border-t border-line/60 gap-2`}
      >
        {myStatus === 'pending' ? (
          <PressableScale
            onPress={() => void onAccept()}
            disabled={busy}
            feedback={false}
            style={tw`py-4 rounded-card bg-emerald-600 items-center ${busy ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-bold`}>Accept invite</Text>
          </PressableScale>
        ) : seed.status === 'mature' ? (
          <PressableScale
            onPress={() => navigateFromRoot(navigation, 'Garden')}
            feedback="open"
            style={tw`py-4 rounded-card bg-raised items-center`}
          >
            <Text style={tw`text-ink font-bold`}>View in Garden</Text>
          </PressableScale>
        ) : (
          <>
            <PressableScale
              onPress={() => setCheckInOpen(true)}
              disabled={busy}
              feedback={false}
              style={tw`py-4 rounded-card bg-emerald-600 items-center flex-row justify-center gap-2 ${
                busy ? 'opacity-60' : ''
              }`}
            >
              <Ionicons name="camera-outline" size={iconSize.sm} color="#fff" />
              <Text style={tw`text-white font-bold text-callout`}>Check in with evidence</Text>
            </PressableScale>
            {canMature ? (
              <PressableScale
                onPress={() => void onMature()}
                disabled={busy}
                feedback={false}
                style={tw`py-3.5 rounded-card bg-energy-600 items-center`}
              >
                <Text style={tw`text-white font-bold`}>Call into your Garden</Text>
              </PressableScale>
            ) : null}
          </>
        )}
      </View>

      <SeedCheckInSheet
        visible={checkInOpen}
        seed={seed}
        onClose={() => setCheckInOpen(false)}
        onDone={(s, stagedUp) => {
          setCheckInOpen(false);
          setSeed(s);
          setPulseKey((k) => k + 1);
          void load();
          if (stagedUp) {
            const stageName = s.stage;
            InteractionManager.runAfterInteractions(() => {
              void alertMessage('Stage up!', `Your seed is now a ${stageName}.`);
            });
          }
        }}
      />
    </SafeAreaView>
  );
}
