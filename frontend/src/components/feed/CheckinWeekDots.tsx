import React from 'react';
import { Animated, View } from 'react-native';
import type { StreakDayStatus } from '../../services/api/growth';

type Props = {
  days: { day: string; status: StreakDayStatus }[];
  /** Day key (YYYY-MM-DD) whose dot fills in. */
  todayKey: string;
  /** 0 → 1: today's emerald fill scales in (drive with spring 'snappy', native driver). */
  fill: Animated.Value;
  size?: number;
};

const STATUS_LABEL: Record<StreakDayStatus, string> = {
  active: 'grew',
  rest: 'rest day',
  missed: 'quiet',
  today: 'today',
  future: 'upcoming',
};

function dotStyle(status: StreakDayStatus): object {
  switch (status) {
    case 'active':
      return { backgroundColor: '#059669' };
    case 'rest':
      return { backgroundColor: '#A7F3D0', borderWidth: 1, borderColor: '#34D399' };
    case 'missed':
      return { backgroundColor: '#E7E5E4' };
    default:
      return { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#E7E5E4' };
  }
}

/**
 * WeekDots for the just-checked-in moment: identical dots, except today's
 * starts as the coral ring and an emerald fill springs into it.
 */
function CheckinWeekDots({ days, todayKey, fill, size = 8 }: Props) {
  if (!days?.length) return null;
  const label = days
    .map((d) => (d.day === todayKey ? 'today grew' : STATUS_LABEL[d.status]))
    .join(', ');
  const base = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      accessible
      accessibilityLabel={`This week: ${label}`}
    >
      {days.map((d) => {
        if (d.day !== todayKey) return <View key={d.day} style={[base, dotStyle(d.status)]} />;
        return (
          <View
            key={d.day}
            style={[base, { borderWidth: 1.5, borderColor: '#F97066', alignItems: 'center', justifyContent: 'center' }]}
          >
            <Animated.View
              style={[
                base,
                {
                  position: 'absolute',
                  backgroundColor: '#059669',
                  opacity: fill.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                  transform: [{ scale: fill }],
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

export default React.memo(CheckinWeekDots);
