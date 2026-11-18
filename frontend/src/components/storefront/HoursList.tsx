import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import { DAY_LABELS, isOpenNow, type StorefrontHours } from '../../services/api/storefront';

type Props = {
  hours: StorefrontHours[];
  /** Override "now" (tests / previews). */
  now?: Date;
};

/** Monday-first week with each day's opening hours; today in bold, closed days marked. */
export default function HoursList({ hours, now = new Date() }: Props) {
  if (!hours.length) return null;
  const today = now.getDay();
  const open = isOpenNow(hours, now);
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <View>
      {open !== null ? (
        <View style={tw`flex-row items-center mb-2`}>
          <View style={tw`w-2 h-2 rounded-full mr-2 ${open ? 'bg-brand-600' : 'bg-stone-400'}`} />
          <Text style={tw`text-footnote font-semibold ${open ? 'text-leaf-ink' : 'text-ink-3'}`}>
            {open ? 'Open now' : 'Closed now'}
          </Text>
        </View>
      ) : null}
      {order.map((day) => {
        const slots = hours.filter((h) => h.day === day);
        const isToday = day === today;
        const text = slots.length ? slots.map((s) => `${s.open}–${s.close}`).join(', ') : 'Closed';
        return (
          <View
            key={day}
            style={tw`flex-row justify-between py-1`}
            accessible
            accessibilityLabel={`${DAY_LABELS[day]}${isToday ? ', today' : ''}: ${text}`}
          >
            <Text style={tw`text-footnote ${isToday ? 'font-semibold text-ink' : 'text-ink-2'}`}>
              {DAY_LABELS[day]}
              {isToday ? ' · today' : ''}
            </Text>
            <Text style={tw`text-footnote ${isToday ? 'font-semibold text-ink' : slots.length ? 'text-ink-2' : 'text-ink-3'}`}>
              {text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
