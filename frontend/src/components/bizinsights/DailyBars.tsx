import React, { useState } from 'react';
import { View, Text } from 'react-native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { InsightsDay } from '../../services/api/bizInsights';

type Props = {
  days: InsightsDay[];
  /** Plot height in px. */
  height?: number;
  /** Compact = sparkline-sized, no axis labels. */
  compact?: boolean;
};

function viewsOf(d: InsightsDay) {
  return d.storefront_views + d.product_views;
}

function shortDay(day: string) {
  const [, m, d] = day.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Daily views (storefront + product) as thin bars anchored to the baseline. Single series
 * in the brand hue, so no legend; tapping a bar shows that day's numbers above the plot.
 */
export default function DailyBars({ days, height = 96, compact = false }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(viewsOf));
  const total = days.reduce((n, d) => n + viewsOf(d), 0);
  const sel = picked != null ? days[picked] : null;
  // Many days → thinner gaps so 90 bars still fit.
  const gap = days.length > 40 ? 1 : 2;

  return (
    <View>
      {!compact ? (
        <Text style={[tw`text-caption text-ink-3 mb-2`, { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
          {sel
            ? `${shortDay(sel.day)} · ${viewsOf(sel)} view${viewsOf(sel) === 1 ? '' : 's'} · ${sel.saves} save${sel.saves === 1 ? '' : 's'}`
            : 'Views per day · tap a bar for details'}
        </Text>
      ) : null}
      <View
        style={[tw`flex-row items-end`, { height }]}
        accessible={compact}
        accessibilityLabel={compact ? `${total} views over ${days.length} days` : undefined}
      >
        {days.map((d, i) => {
          const v = viewsOf(d);
          const h = v > 0 ? Math.max(4, Math.round((v / max) * height)) : 2;
          const active = picked === i;
          const bar = (
            <View
              style={[
                {
                  height: h,
                  borderTopLeftRadius: v > 0 ? 4 : 1,
                  borderTopRightRadius: v > 0 ? 4 : 1,
                  backgroundColor: v > 0 ? theme.colors.brand : theme.colors.line,
                  opacity: picked == null || active ? 1 : 0.45,
                },
              ]}
            />
          );
          if (compact) {
            return (
              <View key={d.day} style={{ flex: 1, marginHorizontal: gap / 2 }}>
                {bar}
              </View>
            );
          }
          return (
            <PressableScale
              key={d.day}
              onPress={() => setPicked(active ? null : i)}
              style={[{ flex: 1, paddingHorizontal: gap / 2, height, justifyContent: 'flex-end' }]}
              accessibilityRole="button"
              accessibilityLabel={`${d.day}: ${v} views, ${d.saves} saves`}
            >
              {bar}
            </PressableScale>
          );
        })}
      </View>
      {!compact && days.length > 1 ? (
        <View style={tw`flex-row justify-between mt-1`}>
          <Text style={tw`text-caption text-ink-3`}>{shortDay(days[0].day)}</Text>
          <Text style={tw`text-caption text-ink-3`}>{shortDay(days[days.length - 1].day)}</Text>
        </View>
      ) : null}
    </View>
  );
}
