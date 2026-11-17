import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import type { WeeklyCommitment } from '../../services/api/weekly';
import { commitmentProgressLabel, ringPositions, weekdayLetter, weekdayName } from './weeklyMeta';

type Props = {
  commitment: WeeklyCommitment;
  size?: number;
};

const STATUS_WORD: Record<string, string> = {
  active: 'showed up',
  pass: 'rest pass',
  today: 'today',
  future: 'still to come',
  open: 'open',
};

/**
 * Progress ring for the weekly commitment: the 7 days of the week sit around a
 * circle (filled = showed up, leaf = rest pass), with "3/5" in the middle.
 * Static (no animation), so it is reduced-motion safe by construction.
 */
function CommitmentRing({ commitment, size = 88 }: Props) {
  const dot = Math.round(size * 0.2);
  const radius = size / 2 - dot / 2;
  const pos = ringPositions(commitment.days.length || 7, radius);
  const covered = Math.min(commitment.covered, commitment.target_days);
  const done = commitment.covered >= commitment.target_days;
  const label = `Weekly goal: ${commitmentProgressLabel(commitment)}. ${commitment.days
    .map((d) => `${weekdayName(d.day)} ${STATUS_WORD[d.status] ?? ''}`)
    .join(', ')}`;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: commitment.target_days, now: covered }}
      style={{ width: size, height: size }}
    >
      {commitment.days.map((d, i) => {
        const p = pos[i];
        const filled = d.status === 'active';
        const pass = d.status === 'pass';
        const today = d.status === 'today';
        return (
          <View
            key={d.day}
            style={[
              {
                position: 'absolute',
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                left: size / 2 + p.x - dot / 2,
                top: size / 2 + p.y - dot / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: filled ? 0 : 1.5,
                borderColor: today ? theme.colors.brand : theme.colors.border,
                backgroundColor: filled ? theme.colors.brand : pass ? theme.colors.subtle : 'transparent',
              },
            ]}
          >
            {pass ? (
              <Ionicons name="leaf" size={Math.round(dot * 0.55)} color={theme.colors.brand} />
            ) : (
              <Text
                style={[
                  tw`font-semibold`,
                  { fontSize: Math.round(dot * 0.45), color: filled ? '#FFFFFF' : theme.colors.textMuted },
                ]}
              >
                {weekdayLetter(d.day)}
              </Text>
            )}
          </View>
        );
      })}
      <View style={[tw`absolute items-center justify-center`, { left: 0, right: 0, top: 0, bottom: 0 }]}>
        {done ? (
          <Ionicons name="checkmark-circle" size={Math.round(size * 0.3)} color={theme.colors.brand} />
        ) : (
          <Text style={tw`text-callout font-bold text-ink`}>
            {covered}
            <Text style={tw`text-footnote font-semibold text-ink-3`}>/{commitment.target_days}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

export default React.memo(CommitmentRing);
