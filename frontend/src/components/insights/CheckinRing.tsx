import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '../../lib/tw';
import { ringDots, ringProgress } from './insightsMath';

type Props = { needed: number; size?: number };

/** Mini progress ring: one dot per check-in toward the first patterns (no SVG needed). */
export default function CheckinRing({ needed, size = 44 }: Props) {
  const c = useThemeColors();
  const { done, total } = ringProgress(needed);
  const dot = Math.round(size / 5.5);
  const dots = ringDots(total, size, dot);
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} check-ins`}
      accessibilityValue={{ min: 0, max: total, now: done }}
    >
      {dots.map((p, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: i < done ? c.brand : c.raised,
            borderWidth: i < done ? 0 : 1,
            borderColor: c.line,
          }}
        />
      ))}
    </View>
  );
}
