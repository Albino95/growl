import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import ErrorState from '../ui/ErrorState';
import Skeleton from '../ui/Skeleton';
import { getCohortProgress, type Cohort, type CohortProgress } from '../../services/api/cohorts';
import { useRefresh } from '../../hooks/useRefresh';
import { formatDay, inactiveLabel, personName } from './cohortCopy';

type Props = { cohort: Cohort };

function Tile({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <View style={tw`flex-1 bg-card border border-line rounded-card px-3 py-3`} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={tw`text-title font-bold text-ink`}>{value}</Text>
      <Text style={tw`text-footnote text-ink-2 mt-0.5`}>{label}</Text>
      {hint ? <Text style={tw`text-caption text-ink-3 mt-0.5`}>{hint}</Text> : null}
    </View>
  );
}

/** Coach: this week at a glance + who might need a nudge. */
export default function CohortProgressTab({ cohort }: Props) {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<CohortProgress | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getCohortProgress(cohort.id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [cohort.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const refresh = useRefresh(load);

  return (
    <ScrollView contentContainerStyle={tw`px-gutter pt-3 pb-16 gap-3`} refreshControl={<RefreshControl {...refresh} />}>
      {!data && !failed ? (
        <View style={tw`gap-3`}>
          <View style={tw`flex-row gap-3`}>
            <Skeleton style={tw`flex-1 h-24 rounded-card`} />
            <Skeleton style={tw`flex-1 h-24 rounded-card`} />
          </View>
          <Skeleton style={tw`h-40 rounded-card`} />
        </View>
      ) : !data ? (
        <ErrorState compact title="Progress is still loading" message="We couldn’t reach it just now." onRetry={() => void load()} />
      ) : (
        <>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase px-1`}>
            {data.week.current_week >= 1 && data.week.current_week <= data.week.weeks
              ? `Week ${data.week.current_week} of ${data.week.weeks} · `
              : ''}
            {formatDay(data.week.from)} – {formatDay(data.week.to)}
          </Text>
          <View style={tw`flex-row gap-3`}>
            <Tile
              value={`${data.active_this_week}/${data.members_total}`}
              label="Active this week"
              hint={data.members_total ? `${data.active_pct}%` : undefined}
            />
            <Tile
              value={data.completions_this_week.total ? `${data.completion_pct}%` : '—'}
              label="Homework done"
              hint={
                data.completions_this_week.total
                  ? `${data.completions_this_week.done} of ${data.completions_this_week.total} this week`
                  : 'Nothing due this week'
              }
            />
          </View>
          <Tile value={`${data.overall_completion_pct}%`} label="All homework so far" />

          <View style={tw`bg-card border border-line rounded-card px-4 py-3.5`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="hand-left-outline" size={16} color={theme.colors.icon} />
              <Text style={tw`ml-2 text-callout font-semibold text-ink flex-1`}>Might need you</Text>
              <Text style={tw`text-footnote text-ink-3`}>{data.needs_attention.length}</Text>
            </View>
            <Text style={tw`text-footnote text-ink-3 mt-1`}>
              Quiet for {data.inactive_days_threshold}+ days. A short, kind message often brings people back.
            </Text>
            {data.needs_attention.length === 0 ? (
              <View style={tw`flex-row items-center mt-3`}>
                <Ionicons name="leaf-outline" size={16} color={theme.colors.leafInk} />
                <Text style={tw`ml-1.5 text-footnote text-ink-2`}>Everyone showed up recently.</Text>
              </View>
            ) : (
              <View style={tw`mt-2`}>
                {data.needs_attention.map((x) => (
                  <PressableScale
                    key={x.user.id}
                    onPress={() => navigation.navigate('PublicProfile', { userId: x.user.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${personName(x.user)}, ${inactiveLabel(x.days_inactive)}`}
                    style={tw`flex-row items-center py-2 border-t border-line`}
                  >
                    <GrowAvatar userId={x.user.id} username={x.user.username} uri={x.user.avatar_url} size={30} />
                    <Text style={tw`flex-1 ml-2.5 text-body text-ink`} numberOfLines={1}>
                      {personName(x.user)}
                    </Text>
                    <Text style={tw`text-footnote text-ink-3`}>{inactiveLabel(x.days_inactive)}</Text>
                  </PressableScale>
                ))}
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}
