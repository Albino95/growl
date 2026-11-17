import React, { useCallback, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { listCohorts, type CohortsPayload } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { personName, weekLabel } from './cohortCopy';

/**
 * Profile section for clients: groups you're in (+ invites) → Groups screen.
 * Hidden when the API doesn't have groups yet (404). With no groups it shrinks
 * to a quiet "Have a group code?" row.
 */
export default function YourGroupsSection() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<CohortsPayload | null>(null);
  const [hidden, setHidden] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      listCohorts()
        .then((d) => alive && setData(d))
        .catch((e) => {
          if (alive && e instanceof ApiError && e.status === 404) setHidden(true);
        });
      return () => {
        alive = false;
      };
    }, [])
  );

  if (hidden || !data) return null;
  const groups = data.member.filter((c) => c.status === 'active').slice(0, 3);
  const invites = data.invites.length;
  const open = () => navigateFromRoot(navigation, 'Cohorts');

  if (!groups.length && !invites) {
    return (
      <PressableScale
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Your groups. Have a group code?"
        style={tw`mt-3 flex-row items-center px-4 py-3 bg-card border border-line/80 rounded-card`}
      >
        <Ionicons name="people-outline" size={18} color={theme.colors.icon} />
        <Text style={tw`flex-1 ml-2.5 text-footnote text-ink-2`}>Have a group code from a coach?</Text>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={open}
      feedback={false}
      accessibilityRole="button"
      accessibilityLabel={`Your groups: ${groups.map((g) => g.title).join(', ')}${
        invites ? `. ${invites} ${invites === 1 ? 'invite' : 'invites'}` : ''
      }`}
      style={tw`mt-3 bg-card border border-line/80 rounded-card px-4 py-3.5`}
    >
      <View style={tw`flex-row items-center`}>
        <Text style={tw`flex-1 text-caption font-semibold tracking-widest text-ink-3 uppercase`}>Your groups</Text>
        {invites ? (
          <View style={tw`px-2 py-0.5 rounded-chip bg-emerald-600 mr-2`}>
            <Text style={tw`text-caption font-semibold text-white`}>
              {invites} {invites === 1 ? 'invite' : 'invites'}
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
      </View>
      {groups.length ? (
        <View style={tw`mt-2.5 gap-2`}>
          {groups.map((g) => (
            <View key={g.id} style={tw`flex-row items-center`}>
              <Ionicons name="people" size={16} color={theme.colors.brand} />
              <Text style={tw`flex-1 ml-2 text-footnote font-semibold text-ink`} numberOfLines={1}>
                {g.title}
              </Text>
              <Text style={tw`text-xs text-ink-3`} numberOfLines={1}>
                {weekLabel(g)} · {personName(g.coach)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={tw`mt-1.5 text-sm text-ink-2`}>A coach invited you to a group.</Text>
      )}
    </PressableScale>
  );
}
