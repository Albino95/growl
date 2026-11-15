import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import tw, { useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import FadeInUp from '../ui/FadeInUp';
import Skeleton from '../ui/Skeleton';
import { getInsights, type InsightsPayload, type InsightsRange } from '../../services/api/insights';
import { toast } from '../../state/useToastStore';
import InsightCard from './InsightCard';
import CheckinRing from './CheckinRing';
import InsightsExplainerSheet from './InsightsExplainerSheet';
import { loadHiddenInsights, saveHiddenInsights } from './hiddenInsights';
import { notReadyCopy, visibleInsights } from './insightsMath';

type Props = { days?: InsightsRange; refreshKey?: number };

/**
 * "Your patterns" card on the Progress tab. Hides itself entirely when the
 * endpoint isn't deployed or fails, and when every pattern has been hidden.
 */
export default function InsightsSection({ days = 30, refreshKey = 0 }: Props) {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'hidden'>('loading');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [explain, setExplain] = useState(false);
  const c = useThemeColors();

  const load = useCallback(async () => {
    try {
      const [res, ids] = await Promise.all([getInsights(days), loadHiddenInsights()]);
      setHidden(ids);
      if (!res) {
        setState('hidden');
        return;
      }
      setData(res);
      setState('ready');
    } catch {
      setState((s) => (s === 'ready' ? s : 'hidden'));
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const setAndSave = useCallback((update: (prev: Set<string>) => Set<string>) => {
    setHidden((prev) => {
      const next = update(prev);
      void saveHiddenInsights(next);
      return next;
    });
  }, []);

  const hide = useCallback(
    (id: string) => {
      setAndSave((prev) => new Set(prev).add(id));
      toast.info('Pattern hidden', {
        icon: 'eye-off-outline',
        action: {
          label: 'Undo',
          onPress: () =>
            setAndSave((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            }),
        },
      });
    },
    [setAndSave]
  );

  if (state === 'hidden') return null;

  if (state === 'loading' && !data) {
    return (
      <View style={tw`mt-3 bg-card border border-line/80 rounded-card p-4`}>
        <Skeleton style={tw`h-3 w-28 rounded-chip mb-3`} />
        <Skeleton style={tw`h-16 w-full rounded-control`} />
      </View>
    );
  }
  if (!data) return null;

  const list = data.ready ? visibleInsights(data.insights, hidden) : [];
  // Ready but nothing to say (thin/flat data or all hidden): stay out of the way.
  if (data.ready && list.length === 0) return null;

  return (
    <View style={tw`mt-3 bg-card border border-line/80 rounded-card p-4`}>
      <View style={tw`flex-row items-center justify-between mb-3`}>
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`} accessibilityRole="header">
          Your patterns
        </Text>
        <PressableScale
          onPress={() => setExplain(true)}
          feedback="open"
          accessibilityRole="button"
          accessibilityLabel="How this works"
          hitSlop={8}
        >
          <Text style={[tw`text-footnote font-semibold`, { color: c.leafInk }]}>How this works</Text>
        </PressableScale>
      </View>

      {data.ready ? (
        list.map((i, idx) => (
          <FadeInUp key={i.id} delay={idx * 60}>
            <InsightCard insight={i} onHide={hide} onExplain={() => setExplain(true)} />
          </FadeInUp>
        ))
      ) : (
        <View style={tw`flex-row items-center`}>
          <CheckinRing needed={data.checkins_needed} />
          <View style={tw`flex-1 ml-3`}>
            <Text style={tw`text-callout font-semibold text-ink`}>{notReadyCopy(data.checkins_needed)}</Text>
            <Text style={tw`text-footnote text-ink-2 mt-0.5`}>
              Check in from Home. Gentle patterns show up here after a week or so.
            </Text>
          </View>
        </View>
      )}

      <InsightsExplainerSheet visible={explain} days={data.days || days} onClose={() => setExplain(false)} />
    </View>
  );
}
