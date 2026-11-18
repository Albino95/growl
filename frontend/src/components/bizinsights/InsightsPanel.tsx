import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import KpiCard from '../business/KpiCard';
import DailyBars from './DailyBars';
import CATEGORIES from '../../data/categories';
import {
  getBizInsights,
  insightsActivity,
  percentChange,
  type BizInsights,
  type InsightsPeriod,
  type InsightsTotals,
} from '../../services/api/bizInsights';
import { feedback } from '../../utils/interactionFeedback';

const PERIODS: InsightsPeriod[] = ['7d', '30d', '90d'];

const SOURCE_LABELS: Record<string, string> = {
  feed: 'Feed',
  search: 'Search',
  explore: 'Explore',
  storefront: 'Your storefront',
  shop: 'Shop',
  instructor: 'Instructors',
  link: 'Partner links',
  other: 'Other',
};

function pathLabel(key: string) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function delta(totals: InsightsTotals, previous: InsightsTotals, key: keyof InsightsTotals) {
  const pct = percentChange(totals[key], previous[key]);
  if (pct == null) {
    return totals[key] > 0 && previous[key] === 0
      ? { change: 'new', a11y: 'new this period', trend: 'up' as const }
      : { change: undefined, a11y: undefined, trend: 'neutral' as const };
  }
  const trend = pct > 0 ? ('up' as const) : pct < 0 ? ('down' as const) : ('neutral' as const);
  return {
    change: `${pct > 0 ? '+' : ''}${pct}%`,
    a11y: `${pct > 0 ? 'up' : pct < 0 ? 'down' : 'no change,'} ${Math.abs(pct)} percent from the period before`,
    trend,
  };
}

function Heading({ children }: { children: string }) {
  return (
    <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`} accessibilityRole="header">
      {children}
    </Text>
  );
}

type Props = {
  /** `compact` = dashboard summary (tiles + sparkline); `full` = analytics screen. */
  variant?: 'compact' | 'full';
  /** Shown in compact mode as "See all". */
  onOpenFull?: () => void;
  /** Bump to refetch (pull-to-refresh on the host screen). */
  refreshKey?: number;
  /** Lets the host know whether anything has happened yet (to order sections). */
  onActivity?: (hasActivity: boolean) => void;
};

/**
 * Views, saves, link taps and partner clicks — what a business can learn without orders.
 * Hides itself entirely on servers without insights (404).
 */
export default function InsightsPanel({ variant = 'full', onOpenFull, refreshKey = 0, onActivity }: Props) {
  const [period, setPeriod] = useState<InsightsPeriod>('7d');
  const [data, setData] = useState<BizInsights | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const req = useRef(0);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  const load = useCallback(async (p: InsightsPeriod) => {
    const id = ++req.current;
    try {
      const res = await getBizInsights(p);
      if (id !== req.current) return;
      if (!res) {
        setState('unavailable');
        onActivityRef.current?.(false);
        return;
      }
      setData(res);
      setState('ready');
      onActivityRef.current?.(insightsActivity(res.totals) + insightsActivity(res.previous) > 0);
    } catch {
      if (id === req.current) setState((s) => (s === 'ready' ? s : 'error'));
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period, refreshKey]);

  if (state === 'unavailable') return null;

  const compact = variant === 'compact';
  const t = data?.totals;
  const prev = data?.previous;

  const periodToggle = (
    <View style={tw`flex-row bg-raised/80 rounded-chip p-0.5 border border-line/60`}>
      {PERIODS.map((p) => {
        const selected = p === period;
        return (
          <PressableScale
            key={p}
            disabled={selected}
            onPress={() => {
              feedback.selection();
              setPeriod(p);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Last ${p.replace('d', ' days')}`}
            style={[tw`px-3 py-1.5 rounded-chip`, selected ? tw`bg-card` : null]}
          >
            <Text style={tw`text-xs font-semibold ${selected ? 'text-emerald-700' : 'text-ink-3'}`}>{p}</Text>
          </PressableScale>
        );
      })}
    </View>
  );

  const header = (
    <View style={tw`flex-row items-center justify-between mb-3`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`} accessibilityRole="header">
        People who found you
      </Text>
      {compact && onOpenFull ? (
        <PressableScale onPress={onOpenFull} accessibilityRole="button" hitSlop={8}>
          <Text style={tw`text-sm font-semibold text-emerald-700`}>See all</Text>
        </PressableScale>
      ) : (
        periodToggle
      )}
    </View>
  );

  if (state === 'loading' && !data) {
    return (
      <View>
        {header}
        <View style={tw`flex-row gap-2.5 mb-3`}>
          <Skeleton style={tw`flex-1 h-20 rounded-card`} />
          <Skeleton style={tw`flex-1 h-20 rounded-card`} />
        </View>
        <Skeleton style={tw`h-16 rounded-card`} />
      </View>
    );
  }

  if (state === 'error' && !data) {
    return (
      <View>
        {header}
        <ErrorState compact title="Couldn’t load your insights" onRetry={() => void load(period)} />
      </View>
    );
  }

  if (!t || !prev || !data) return null;

  const nothingYet = insightsActivity(t) === 0;
  const views = t.storefront_views + t.product_views;
  const prevViews = prev.storefront_views + prev.product_views;
  const viewsDelta = delta({ ...t, product_views: views }, { ...prev, product_views: prevViews }, 'product_views');
  const savesDelta = delta(t, prev, 'saves');
  const sfDelta = delta(t, prev, 'storefront_views');
  const pvDelta = delta(t, prev, 'product_views');
  const tapsDelta = delta(t, prev, 'link_taps');
  const clicksDelta = delta(t, prev, 'partner_clicks');

  const tiles = compact ? (
    <View style={tw`flex-row flex-wrap gap-2.5`}>
      <KpiCard label="Views" value={String(views)} change={viewsDelta.change} changeA11y={viewsDelta.a11y} trend={viewsDelta.trend} icon="eye-outline" onPress={onOpenFull} />
      <KpiCard label="Saves" value={String(t.saves)} change={savesDelta.change} changeA11y={savesDelta.a11y} trend={savesDelta.trend} icon="heart-outline" onPress={onOpenFull} />
    </View>
  ) : (
    <View style={tw`flex-row flex-wrap gap-2.5`}>
      <KpiCard label="Storefront visits" value={String(t.storefront_views)} change={sfDelta.change} changeA11y={sfDelta.a11y} trend={sfDelta.trend} icon="storefront-outline" />
      <KpiCard label="Product views" value={String(t.product_views)} change={pvDelta.change} changeA11y={pvDelta.a11y} trend={pvDelta.trend} icon="eye-outline" />
      <KpiCard label="Saves" value={String(t.saves)} change={savesDelta.change} changeA11y={savesDelta.a11y} trend={savesDelta.trend} icon="heart-outline" />
      <KpiCard label="Link taps" value={String(t.link_taps)} change={tapsDelta.change} changeA11y={tapsDelta.a11y} trend={tapsDelta.trend} icon="link-outline" />
      <KpiCard label="Partner clicks" value={String(t.partner_clicks)} change={clicksDelta.change} changeA11y={clicksDelta.a11y} trend={clicksDelta.trend} icon="people-circle-outline" />
    </View>
  );

  if (compact) {
    return (
      <View>
        {header}
        {tiles}
        {nothingYet ? (
          <Text style={tw`text-footnote text-ink-3 mt-3 leading-5`}>
            Nobody has stopped by in the last 7 days yet. Share a post or a partner link — visits, views and saves
            show up here as they happen.
          </Text>
        ) : (
          <View style={tw`mt-3`}>
            <DailyBars days={data.daily} height={36} compact />
          </View>
        )}
      </View>
    );
  }

  const maxSource = Math.max(1, ...data.sources.map((s) => s.views));
  return (
    <View>
      {header}
      {tiles}
      <Text style={tw`text-caption text-ink-3 mt-2`}>Compared with the {period.replace('d', ' days')} before.</Text>

      <View style={tw`bg-card rounded-card p-4 mt-4 border border-line`}>
        {nothingYet ? (
          <View style={tw`items-center py-3`}>
            <Ionicons name="sparkles-outline" size={26} color={theme.colors.iconMuted} />
            <Text style={tw`text-callout font-semibold text-ink mt-2`}>Quiet so far</Text>
            <Text style={tw`text-footnote text-ink-3 text-center mt-1 leading-5`}>
              When people open your storefront or products, each day shows up here. A post or a partner link
              is the quickest way to get the first visitors.
            </Text>
          </View>
        ) : (
          <DailyBars days={data.daily} height={period === '7d' ? 96 : 80} />
        )}
      </View>

      {data.top_products.length ? (
        <View style={tw`mt-5`}>
          <Heading>Most viewed products</Heading>
          <View style={tw`bg-card rounded-card px-4 border border-line`}>
            {data.top_products.map((p, i) => (
              <View
                key={p.id}
                style={tw`flex-row items-center py-2.5 ${i < data.top_products.length - 1 ? 'border-b border-line' : ''}`}
              >
                {p.image_url ? (
                  <Image source={{ uri: p.image_url }} style={tw`w-9 h-9 rounded-control mr-3 bg-raised`} contentFit="cover" />
                ) : (
                  <View style={tw`w-9 h-9 rounded-control mr-3 bg-raised items-center justify-center`}>
                    <Ionicons name="cube-outline" size={16} color={theme.colors.iconMuted} />
                  </View>
                )}
                <Text style={tw`flex-1 text-sm font-medium text-ink pr-2`} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[tw`text-xs text-ink-2`, { fontVariant: ['tabular-nums'] }]}>
                  {p.views} views · {p.saves} saves
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {data.sources.length ? (
        <View style={tw`mt-5`}>
          <Heading>Where views came from</Heading>
          <View style={tw`bg-card rounded-card p-4 border border-line`}>
            {data.sources.map((s, i) => (
              <View key={s.source} style={tw`${i < data.sources.length - 1 ? 'mb-3' : ''}`}>
                <View style={tw`flex-row justify-between mb-1`}>
                  <Text style={tw`text-sm text-ink-2`}>{SOURCE_LABELS[s.source] ?? s.source}</Text>
                  <Text style={[tw`text-sm font-semibold text-ink`, { fontVariant: ['tabular-nums'] }]}>{s.views}</Text>
                </View>
                <View style={tw`h-2 bg-raised rounded-chip overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full rounded-chip`,
                      { width: `${Math.round((s.views / maxSource) * 100)}%`, backgroundColor: theme.colors.brand },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={tw`mt-5`}>
        <Heading>What your visitors grow in</Heading>
        <View style={tw`bg-card rounded-card p-4 border border-line`}>
          {data.audience && data.audience.top_paths.length ? (
            <View style={tw`flex-row flex-wrap gap-2`}>
              {data.audience.top_paths.map((p) => (
                <View key={p.path} style={tw`px-3 py-1.5 rounded-chip bg-raised`}>
                  <Text style={tw`text-xs font-semibold text-ink-2`}>
                    {pathLabel(p.path)} · {Math.round(p.share * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={tw`text-footnote text-ink-3 leading-5`}>
              Shows once at least 20 different signed-in people have visited in this period — so no one can be
              singled out.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
