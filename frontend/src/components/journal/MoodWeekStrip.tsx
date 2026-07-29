import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import tw from '../../lib/tw';
import type { JournalEntry, JournalMood } from '../../services/api/journal';
import { MOOD_META, dateKeyFromIso, localDateKey } from './journalMeta';

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
        const color = day.mood ? MOOD_META[day.mood].color : day.hasEntry ? '#A8A29E' : '#E7E5E4';
        const wash = day.mood ? MOOD_META[day.mood].wash : 'transparent';
        return (
          <Pressable
            key={day.key}
            onPress={() => onSelectDay?.(day.key)}
            style={tw`items-center flex-1`}
            accessibilityLabel={`${day.key}${day.mood ? `, ${day.mood}` : ''}`}
          >
            <Text
              style={tw`text-[11px] mb-2 ${day.isToday ? 'text-stone-900 font-semibold' : 'text-stone-400'}`}
            >
              {day.label}
            </Text>
            <View
              style={[
                tw`w-9 h-9 rounded-full items-center justify-center`,
                {
                  backgroundColor: day.hasEntry ? wash : 'rgba(255,255,255,0.35)',
                  borderWidth: day.isToday ? 2 : 0,
                  borderColor: day.isToday ? '#1C1917' : 'transparent',
                },
              ]}
            >
              {day.mood ? (
                <Text style={tw`text-sm`}>{MOOD_META[day.mood].glyph}</Text>
              ) : (
                <View style={[tw`w-2.5 h-2.5 rounded-full`, { backgroundColor: color }]} />
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
