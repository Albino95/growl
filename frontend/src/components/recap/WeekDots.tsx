import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import type { StreakDayStatus } from '../../services/api/growth';

type Props = {
  days: { day: string; status: StreakDayStatus }[];
  /** Dot diameter in px. */
  size?: number;
  showLabels?: boolean;
  /** Light text on dark/brand backgrounds. */
  tone?: 'default' | 'onBrand';
};

const STATUS_LABEL: Record<StreakDayStatus, string> = {
  active: 'grew',
  rest: 'rest day',
  missed: 'quiet',
  today: 'today',
  future: 'upcoming',
};

function weekdayLetter(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'narrow' });
}

/** Seven-dot Mon…Sun row: filled = active, leaf = rest, ring = today, faint = quiet/upcoming. */
function WeekDots({ days, size = 10, showLabels = false, tone = 'default' }: Props) {
  if (!days?.length) return null;
  const label = days.map((d) => `${weekdayLetter(d.day)} ${STATUS_LABEL[d.status]}`).join(', ');
  return (
    <View style={tw`flex-row items-center gap-1.5`} accessible accessibilityLabel={`This week: ${label}`}>
      {days.map((d) => {
        const base = { width: size, height: size, borderRadius: size / 2 };
        let style: object;
        switch (d.status) {
          case 'active':
            style = { backgroundColor: tone === 'onBrand' ? '#FFFFFF' : '#059669' };
            break;
          case 'rest':
            style = { backgroundColor: '#A7F3D0', borderWidth: 1, borderColor: '#34D399' };
            break;
          case 'today':
            style = { borderWidth: 1.5, borderColor: '#F97066', backgroundColor: 'transparent' };
            break;
          case 'missed':
            style = { backgroundColor: tone === 'onBrand' ? 'rgba(255,255,255,0.3)' : '#E7E5E4' };
            break;
          default:
            style = {
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: tone === 'onBrand' ? 'rgba(255,255,255,0.3)' : '#E7E5E4',
            };
        }
        return (
          <View key={d.day} style={tw`items-center`}>
            <View style={[base, style]} />
            {showLabels ? (
              <Text style={tw`text-[9px] mt-1 ${tone === 'onBrand' ? 'text-white/70' : 'text-stone-400'}`}>
                {weekdayLetter(d.day)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(WeekDots);
