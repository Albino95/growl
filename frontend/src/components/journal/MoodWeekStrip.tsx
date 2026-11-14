import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { JournalEntry, JournalMood } from '../../services/api/journal';
import { MOOD_META, dateKeyFromIso, localDateKey, moodWash } from './journalMeta';

type DayCell = {
  key: string;
  label: string;
  mood: JournalMood | null;
  hasEntry: boolean;
  isToday: boolean;
};

type Props = {
  entries: JournalEntry[];
  onSelectDay?: (dateKey: string) => void;
};

export default function MoodWeekStrip({ entries, onSelectDay }: Props) {
  const c = useThemeColors();
  const scheme = useColorSchemeName();
  const days = useMemo(() => {
    const byDay = new Map<string, JournalMood | null>();
    for (const e of entries) {
      const k = dateKeyFromIso(e.created_at);
      if (!byDay.has(k)) {
        byDay.set(k, (e.mood as JournalMood) || null);
      }
    }
    const today = new Date();
    const cells: DayCell[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = localDateKey(d);
      cells.push({
        key,
        label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
        mood: byDay.get(key) ?? null,
        hasEntry: byDay.has(key),
        isToday: i === 0,
      });
    }
    return cells;
  }, [entries]);

  return (
    <View style={tw`flex-row justify-between px-1`}>
      {days.map((day) => {
        const color = day.mood ? MOOD_META[day.mood].color : day.hasEntry ? c.iconMuted : c.line;
        const wash = day.mood ? moodWash(day.mood, scheme) : 'transparent';
        return (
          <PressableScale
            key={day.key}
            pressedScale={0.9}
            onPress={() => onSelectDay?.(day.key)}
            style={tw`items-center flex-1`}
            accessibilityLabel={`${day.key}${day.mood ? `, ${day.mood}` : ''}`}
          >
            <Text
              style={tw`text-caption mb-2 ${day.isToday ? 'text-ink font-semibold' : 'text-ink-3'}`}
            >
              {day.label}
            </Text>
            <View
              style={[
                tw`w-9 h-9 rounded-full items-center justify-center`,
                {
                  backgroundColor: day.hasEntry ? wash : scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.35)',
                  borderWidth: day.isToday ? 2 : 0,
                  borderColor: day.isToday ? c.ink : 'transparent',
                },
              ]}
            >
              {day.mood ? (
                <Text style={tw`text-sm`}>{MOOD_META[day.mood].glyph}</Text>
              ) : (
                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: color }]} />
              )}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
