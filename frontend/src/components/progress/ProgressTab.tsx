import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import CountUpText from '../ui/CountUpText';
import { getProgress, type Progress } from '../../services/api/growth';
import { localDayKey } from '../../services/api/http';
import { getCategoryLabel } from '../../utils/categoryLabels';
import type { ShareCardPayload } from '../share/ShareCardSheet';
import { progressSharePayload } from '../badges/shareAdapters';
import ActivityHeatmap from './ActivityHeatmap';
import PathBars from './PathBars';
import MoodWeekBars from './MoodWeekBars';

const RANGE_DAYS = 90;

type Props = {
  username: string;
  userId?: string;
  avatar?: string | null;
  /** Current streak (from the growth store) for the summary row. */
  currentStreak?: number | null;
  onShare: (payload: ShareCardPayload) => void;
  /** Bump to force a refetch (e.g. pull-to-refresh on the profile). */
  refreshKey?: number;
};

/** Owner-only Progress tab: summary stats, activity heatmap, per-path bars, mood by week. */
export default function ProgressTab({ username, userId, avatar, currentStreak, onShare, refreshKey = 0 }: Props) {
  const [data, setData] = useState<Progress | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    try {
      const res = await getProgress(RANGE_DAYS);
      if (!res || !Array.isArray(res.days)) throw new Error('bad payload');
      setData(res);
      setState('ready');
    } catch {
      setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (state === 'loading' && !data) {
    return <ActivityIndicator color="#059669" style={tw`py-10`} />;
  }

  if (!data) {
    return (
      <View style={tw`items-center py-10 px-6`}>
        <Text style={tw`text-3xl`}>🌿</Text>
        <Text style={tw`text-sm text-stone-600 mt-2 text-center`}>
          Your progress view isn’t ready just yet.
        </Text>
        <PressableScale
          onPress={() => {
            setState('loading');
            void load();
          }}
          feedback="refresh"
          style={tw`mt-3 px-4 py-2 rounded-full bg-[#EAE4D6] border border-stone-200`}
        >
          <Text style={tw`text-xs font-semibold text-emerald-700`}>Try again</Text>
        </PressableScale>
      </View>
    );
  }

  const topPath = [...data.by_path].sort((a, b) => b.count - a.count)[0];
  const share = () =>
    onShare(
      progressSharePayload({
        username,
        userId,
        avatar,
        totalActiveDays: data.total_active_days,
        longestStreak: data.longest_streak,
        currentStreak: currentStreak ?? undefined,
        rangeDays: RANGE_DAYS,
        topPathLabel: topPath ? getCategoryLabel(topPath.path) : null,
        days: data.days,
      })
    );

  return (
    <View style={tw`px-4 pt-4`}>
      <View style={tw`flex-row gap-2`}>
        <Stat label="Active days" value={data.total_active_days} hint={`last ${RANGE_DAYS} days`} />
        <Stat label="Longest streak" value={data.longest_streak} hint="days" />
        {currentStreak != null ? <Stat label="Current" value={currentStreak} hint="day streak" /> : null}
      </View>

      <Section title="Your days">
        <ActivityHeatmap days={data.days} today={localDayKey()} />
      </Section>

      <Section title="Paths you grew in">
        <PathBars data={data.by_path} />
      </Section>

      <Section title="Mood by week">
        <MoodWeekBars data={data.mood_by_week} />
      </Section>

      <PressableScale
        onPress={share}
        feedback="open"
        style={tw`mt-4 flex-row items-center justify-center py-3 rounded-2xl bg-emerald-600`}
        accessibilityRole="button"
        accessibilityLabel="Share your progress"
      >
        <Ionicons name="share-outline" size={17} color="#fff" />
        <Text style={tw`text-white font-bold ml-1.5`}>Share your progress</Text>
      </PressableScale>
    </View>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <View
      style={tw`flex-1 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-3`}
      accessible
      accessibilityLabel={`${label}: ${value} ${hint}`}
    >
      <Text style={tw`text-[10px] font-semibold tracking-wider text-stone-500 uppercase`} numberOfLines={1}>
        {label}
      </Text>
      <CountUpText style={tw`text-2xl font-bold text-stone-900 mt-0.5`} value={value} />
      <Text style={tw`text-[10px] text-stone-400`}>{hint}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={tw`mt-3 bg-[#FFFcf7] border border-stone-200/80 rounded-2xl p-4`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>{title}</Text>
      {children}
    </View>
  );
}
