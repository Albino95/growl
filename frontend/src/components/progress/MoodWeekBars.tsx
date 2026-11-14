import React from 'react';
import { View, Text } from 'react-native';
import tw from '../../lib/tw';
import { moodColor, shortWeek } from './progressMath';

type Props = {
  data: { week: string; avg: number | null }[];
  /** Bar area height (default 88). */
  height?: number;
  /** Max weeks shown, most recent (default 12). */
  limit?: number;
};

const MOOD_FACES = ['😞', '😕', '😐', '🙂', '😄'];

/** Average mood (1–5) per week as simple vertical bars. */
export default function MoodWeekBars({ data, height = 88, limit = 12 }: Props) {
  const weeks = data.slice(-limit);
  if (!weeks.some((w) => w.avg != null)) {
    return (
      <Text style={tw`text-xs text-ink-3`}>
        Add a mood when you check in and your weeks will show up here.
      </Text>
    );
  }
  return (
    <View style={tw`flex-row`}>
      <View style={{ height, justifyContent: 'space-between', marginRight: 6 }}>
        <Text style={tw`text-caption`}>{MOOD_FACES[4]}</Text>
        <Text style={tw`text-caption`}>{MOOD_FACES[2]}</Text>
        <Text style={tw`text-caption`}>{MOOD_FACES[0]}</Text>
      </View>
      <View style={tw`flex-1 flex-row items-end justify-between`}>
        {weeks.map((w) => {
          const avg = w.avg;
          const h = avg != null ? Math.max(6, (Math.min(5, Math.max(1, avg)) / 5) * height) : 4;
          return (
            <View
              key={w.week}
              style={tw`items-center flex-1`}
              accessible
              accessibilityLabel={`${shortWeek(w.week)}: ${avg != null ? `average mood ${avg.toFixed(1)} of 5` : 'no mood logged'}`}
            >
              <View style={{ height, justifyContent: 'flex-end' }}>
                <View
                  style={{
                    width: 12,
                    height: h,
                    borderRadius: 6,
                    backgroundColor: avg != null ? moodColor(avg) : 'transparent',
                    borderWidth: avg != null ? 0 : 1,
                    borderStyle: 'dashed',
                    borderColor: tw.color('stone-300'),
                  }}
                />
              </View>
              <Text style={tw`text-caption text-ink-3 mt-1`}>{shortWeek(w.week)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
