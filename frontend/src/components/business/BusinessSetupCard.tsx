import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import {
  onboardingRows,
  type OnboardingAction,
  type OnboardingStatus,
} from '../../services/api/businessHelpers';

type Props = {
  status: OnboardingStatus;
  onAction: (action: OnboardingAction) => void;
  onHide?: () => void;
};

/**
 * "Set up your store" checklist on the business Home tab. Progress comes from real data
 * (GET /business/onboarding), so steps tick themselves off as the seller works.
 */
export default function BusinessSetupCard({ status, onAction, onHide }: Props) {
  const rows = onboardingRows(status);
  if (rows.length === 0) return null;
  const done = rows.filter((r) => r.done).length;
  const pct = Math.round((done / rows.length) * 100);
  const next = rows.find((r) => !r.done);

  return (
    <View style={tw`bg-card border border-line rounded-card p-4`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-callout font-semibold text-ink`} accessibilityRole="header">
            Set up your store
          </Text>
          <Text style={tw`text-footnote text-ink-3 mt-0.5`}>
            {done} of {rows.length} done
            {next ? ` · next: ${next.title.toLowerCase()}` : ''}
          </Text>
        </View>
        {onHide ? (
          <PressableScale
            onPress={onHide}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Hide setup checklist"
          >
            <Text style={tw`text-footnote font-semibold text-ink-3`}>Hide</Text>
          </PressableScale>
        ) : null}
      </View>

      <View
        style={tw`h-2 rounded-chip bg-raised mt-3 mb-2 overflow-hidden`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: rows.length, now: done }}
        accessibilityLabel="Store setup progress"
      >
        <View style={[tw`h-2 rounded-chip bg-emerald-600`, { width: `${pct}%` }]} />
      </View>

      {rows.map((row) => (
        <PressableScale
          key={row.key}
          disabled={row.done}
          onPress={() => onAction(row.action)}
          style={tw`flex-row items-center py-2.5`}
          accessibilityRole="button"
          accessibilityState={{ disabled: row.done, checked: row.done }}
          accessibilityLabel={`${row.title}${row.done ? ', done' : ''}`}
          accessibilityHint={row.done ? undefined : row.hint}
        >
          <View
            style={tw`w-7 h-7 rounded-full items-center justify-center mr-3 ${
              row.done ? 'bg-emerald-600' : 'bg-raised border border-line'
            }`}
          >
            <Ionicons
              name={row.done ? 'checkmark' : (row.icon as keyof typeof Ionicons.glyphMap)}
              size={15}
              color={row.done ? '#FFFFFF' : theme.colors.ink3}
            />
          </View>
          <View style={tw`flex-1 pr-2`}>
            <Text
              style={tw`text-body font-medium ${row.done ? 'text-ink-3 line-through' : 'text-ink'}`}
            >
              {row.title}
            </Text>
            {!row.done ? <Text style={tw`text-footnote text-ink-3 mt-0.5`}>{row.hint}</Text> : null}
          </View>
          {!row.done ? (
            <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
          ) : null}
        </PressableScale>
      ))}
    </View>
  );
}
