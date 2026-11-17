import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import CATEGORIES from '../../data/categories';
import type { Cohort } from '../../services/api/cohorts';
import { membersLabel, personName, weekLabel } from './cohortCopy';

type Props = { cohort: Cohort; onPress: () => void };

export function pathLabel(path: string | null | undefined): string | null {
  if (!path) return null;
  return CATEGORIES.find((c) => c.key === path)?.label ?? path;
}

/** One group row: title, path, week, members (coach) or coach (member). */
export default function CohortCard({ cohort, onPress }: Props) {
  const isCoach = cohort.role === 'coach';
  const path = pathLabel(cohort.path);
  const archived = cohort.status === 'archived';
  return (
    <PressableScale
      feedback="open"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cohort.title}. ${weekLabel(cohort)}. ${
        isCoach ? membersLabel(cohort) : `Coach ${personName(cohort.coach)}`
      }`}
      style={tw`bg-card border border-line rounded-card px-4 py-3.5 ${archived ? 'opacity-70' : ''}`}
    >
      <View style={tw`flex-row items-center`}>
        <View style={tw`w-10 h-10 rounded-full bg-emerald-50 items-center justify-center`}>
          <Ionicons name="people" size={20} color={theme.colors.brand} />
        </View>
        <View style={tw`flex-1 ml-3`}>
          <Text style={tw`text-body font-semibold text-ink`} numberOfLines={1}>
            {cohort.title}
          </Text>
          <Text style={tw`text-footnote text-ink-3 mt-0.5`} numberOfLines={1}>
            {[weekLabel(cohort), path, isCoach ? membersLabel(cohort) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
      </View>
      {!isCoach ? (
        <View style={tw`flex-row items-center mt-2.5`}>
          <GrowAvatar userId={cohort.coach.id} username={cohort.coach.username} uri={cohort.coach.avatar_url} size={20} />
          <Text style={tw`ml-2 text-footnote text-ink-2`}>with {personName(cohort.coach)}</Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
