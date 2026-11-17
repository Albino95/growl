import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';
import { formatReminderTime, halfHourSlots } from '../../services/reminderPlan';

const ROW_H = 48;

type Props = {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  /** Visible height of the list (default ~5 rows). */
  height?: number;
};

/** Every half hour, 12:00 AM → 11:30 PM; opens scrolled to the current choice. */
export default function ReminderTimeList({ hour, minute, onChange, height = ROW_H * 5 }: Props) {
  const slots = useMemo(() => halfHourSlots(), []);
  const ref = useRef<ScrollView>(null);
  const selectedIndex = slots.findIndex((s) => s.hour === hour && s.minute === minute);

  useEffect(() => {
    const i = selectedIndex < 0 ? 0 : selectedIndex;
    const y = Math.max(0, i * ROW_H - height / 2 + ROW_H / 2);
    const t = setTimeout(() => ref.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(t);
    // Only on mount: don't yank the list while the user scrolls and taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      style={[tw`bg-raised border border-line rounded-card overflow-hidden`, { height }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Reminder time"
    >
      <ScrollView ref={ref} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {slots.map((s, i) => {
          const selected = i === selectedIndex;
          const label = formatReminderTime(s.hour, s.minute);
          return (
            <PressableScale
              key={label}
              pressedScale={0.98}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => {
                if (selected) return;
                haptic('chip');
                onChange(s.hour, s.minute);
              }}
              style={[
                tw`flex-row items-center justify-between px-4 ${
                  i < slots.length - 1 ? 'border-b border-line' : ''
                }`,
                { height: ROW_H },
              ]}
            >
              <Text style={tw`text-body ${selected ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                {label}
              </Text>
              {selected ? <Ionicons name="checkmark" size={20} color={theme.colors.brand} /> : null}
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
