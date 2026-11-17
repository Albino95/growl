import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, type LayoutChangeEvent } from 'react-native';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';
import {
  HEAT_COLORS,
  REST_BORDER,
  REST_COLOR,
  buildHeatmapGrid,
  describeDay,
  heatShade,
  parseDayKey,
  type HeatCell,
  type ProgressDay,
} from './progressMath';

type Props = {
  days: ProgressDay[];
  /** Local `YYYY-MM-DD` for today. */
  today: string;
  /** Number of week columns (default 13 ≈ 90 days). */
  weeks?: number;
};

const GAP = 3;
const LABEL_W = 18;
const ROW_LABELS = ['M', '', 'W', '', 'F', '', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function prettyDay(key: string): string {
  const d = parseDayKey(key);
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 7 rows (Mon..Sun) × N week columns; emerald intensity by how many kinds of activity. */
export default function ActivityHeatmap({ days, today, weeks = 13 }: Props) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<HeatCell | null>(null);
  const grid = useMemo(() => buildHeatmapGrid(days, today, weeks), [days, today, weeks]);

  const cell = width > 0 ? Math.max(8, Math.min(22, Math.floor((width - LABEL_W - GAP * (weeks - 1)) / weeks))) : 0;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const legend: (keyof typeof HEAT_COLORS)[] = [0, 1, 2, 3, 4];
  // Fills keep brand greens; the empty step and rest days follow the scheme.
  const colors = useThemeColors();
  const dark = useColorSchemeName() === 'dark';
  const heatColor = (s: keyof typeof HEAT_COLORS) => (s === 0 ? colors.raised : HEAT_COLORS[s]);
  const restFill = dark ? (tw.color('amber-50') ?? REST_COLOR) : REST_COLOR;
  const restBorder = dark ? (tw.color('amber-200') ?? REST_BORDER) : REST_BORDER;

  return (
    <View onLayout={onLayout}>
      {cell > 0 ? (
        <View style={tw`flex-row`}>
          <View style={{ width: LABEL_W }}>
            {ROW_LABELS.map((l, i) => (
              <View key={i} style={{ height: cell, marginBottom: i < 6 ? GAP : 0, justifyContent: 'center' }}>
                <Text style={tw`text-caption text-ink-3`}>{l}</Text>
              </View>
            ))}
          </View>
          {grid.map((col, ci) => (
            <View key={col[0].day} style={{ marginRight: ci < grid.length - 1 ? GAP : 0 }}>
              {col.map((c, ri) => {
                const shade = c.future ? null : heatShade(c.data);
                const isSel = selected?.day === c.day;
                const bg =
                  shade === null ? 'transparent' : shade === 'rest' ? restFill : heatColor(shade);
                return (
                  <Pressable
                    key={c.day}
                    disabled={c.future}
                    onPress={() => {
                      feedback.select();
                      setSelected(isSel ? null : c);
                    }}
                    hitSlop={2}
                    accessibilityRole="button"
                    accessibilityLabel={`${prettyDay(c.day)}: ${describeDay(c.data)}`}
                    style={{
                      width: cell,
                      height: cell,
                      marginBottom: ri < 6 ? GAP : 0,
                      borderRadius: Math.max(2, cell * 0.25),
                      backgroundColor: bg,
                      borderWidth: c.isToday || isSel ? 2 : shade === 'rest' ? 1 : 0,
                      borderStyle: shade === 'rest' && !c.isToday && !isSel ? 'dashed' : 'solid',
                      borderColor: isSel ? '#F97066' : c.isToday ? colors.ink : restBorder,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ height: 7 * 14 + 6 * GAP }} />
      )}

      <View style={tw`flex-row items-center justify-between mt-2.5`}>
        <Text style={tw`text-xs text-ink-2 flex-1 pr-2`} numberOfLines={2}>
          {selected ? (
            <>
              <Text style={tw`font-semibold text-ink`}>{prettyDay(selected.day)}</Text>
              {` · ${describeDay(selected.data)}`}
            </>
          ) : (
            'Tap a day to see what you did.'
          )}
        </Text>
        <View style={tw`flex-row items-center`}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: restFill,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: restBorder,
              marginRight: 3,
            }}
          />
          <Text style={tw`text-caption text-ink-3 mr-2`}>rest</Text>
          <Text style={tw`text-caption text-ink-3 mr-1`}>less</Text>
          {legend.map((s) => (
            <View
              key={s}
              style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: heatColor(s), marginRight: 2 }}
            />
          ))}
          <Text style={tw`text-caption text-ink-3 ml-0.5`}>more</Text>
        </View>
      </View>
    </View>
  );
}
