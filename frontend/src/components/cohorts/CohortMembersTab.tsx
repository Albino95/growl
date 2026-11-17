import React from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import EmptyState from '../ui/EmptyState';
import { removeCohortMember, type CohortDetail, type CohortMember } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { useRefresh } from '../../hooks/useRefresh';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { formatDay, membersLabel, personName } from './cohortCopy';

type Props = {
  detail: CohortDetail;
  reload: () => Promise<void>;
  onInvite: () => void;
  onLeave: () => void;
};

/** Members list. Coach: invite + remove. Member: see who's growing alongside you, leave. */
export default function CohortMembersTab({ detail, reload, onInvite, onLeave }: Props) {
  const navigation = useNavigation<any>();
  const { cohort, members } = detail;
  const isCoach = cohort.role === 'coach';
  const refresh = useRefresh(reload);

  const remove = async (m: CohortMember) => {
    const name = personName(m.user);
    const ok = await confirmAsync(
      `Remove ${name}?`,
      'They leave the group and stop getting updates. They can rejoin only if you invite them again.',
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!ok) return;
    try {
      await removeCohortMember(cohort.id, m.user.id);
      toast.info(`${name} was removed`);
      await reload();
    } catch (e) {
      void alertMessage('Couldn’t remove them', e instanceof ApiError ? e.message : undefined);
    }
  };

  return (
    <ScrollView contentContainerStyle={tw`px-gutter pt-3 pb-16`} refreshControl={<RefreshControl {...refresh} />}>
      <View style={tw`flex-row items-center mb-3`}>
        <Text style={tw`flex-1 text-footnote text-ink-2`}>{membersLabel(cohort)}</Text>
        {isCoach && cohort.status === 'active' ? (
          <PressableScale
            feedback="open"
            onPress={onInvite}
            accessibilityRole="button"
            accessibilityLabel="Invite people"
            style={tw`flex-row items-center px-3 py-1.5 rounded-chip bg-emerald-600`}
          >
            <Ionicons name="person-add-outline" size={15} color="#fff" />
            <Text style={tw`ml-1.5 text-footnote font-semibold text-white`}>Invite</Text>
          </PressableScale>
        ) : null}
      </View>

      <PressableScale
        onPress={() => navigation.navigate('PublicProfile', { userId: cohort.coach.id })}
        accessibilityRole="button"
        accessibilityLabel={`Coach ${personName(cohort.coach)}`}
        style={tw`flex-row items-center bg-card border border-line rounded-card px-4 py-3 mb-2`}
      >
        <GrowAvatar userId={cohort.coach.id} username={cohort.coach.username} uri={cohort.coach.avatar_url} size={36} />
        <Text style={tw`flex-1 ml-3 text-body font-semibold text-ink`} numberOfLines={1}>
          {personName(cohort.coach)}
        </Text>
        <View style={tw`px-2 py-0.5 rounded-chip bg-emerald-50`}>
          <Text style={tw`text-caption font-semibold text-emerald-700`}>Coach</Text>
        </View>
      </PressableScale>

      {members.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No members yet"
          description={isCoach ? 'Share your group code or invite clients and friends.' : 'You’re the first one here.'}
          actionLabel={isCoach ? 'Invite people' : undefined}
          onAction={isCoach ? onInvite : undefined}
        />
      ) : (
        <View style={tw`bg-card border border-line rounded-card px-4`}>
          {members.map((m, i) => (
            <View key={m.user.id} style={tw`flex-row items-center py-2.5 ${i ? 'border-t border-line' : ''}`}>
              <PressableScale
                onPress={() => navigation.navigate('PublicProfile', { userId: m.user.id })}
                accessibilityRole="button"
                accessibilityLabel={personName(m.user)}
                style={tw`flex-1 flex-row items-center`}
              >
                <GrowAvatar userId={m.user.id} username={m.user.username} uri={m.user.avatar_url} size={32} />
                <View style={tw`flex-1 ml-3`}>
                  <Text style={tw`text-body text-ink`} numberOfLines={1}>
                    {personName(m.user)}
                  </Text>
                  {isCoach ? (
                    <Text style={tw`text-caption text-ink-3`}>Joined {formatDay(m.joined_at.slice(0, 10))}</Text>
                  ) : null}
                </View>
              </PressableScale>
              {isCoach ? (
                <PressableScale
                  onPress={() => void remove(m)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${personName(m.user)}`}
                  style={tw`p-1.5`}
                >
                  <Ionicons name="person-remove-outline" size={18} color={theme.colors.iconMuted} />
                </PressableScale>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {!isCoach ? (
        <>
          <Text style={tw`text-footnote text-ink-3 mt-4 leading-5`}>
            Members see each other’s names and photos and the coach’s updates. Homework, proofs and check-ins stay
            private between you and the coach.
          </Text>
          <PressableScale
            onPress={onLeave}
            accessibilityRole="button"
            accessibilityLabel="Leave group"
            style={tw`mt-6 py-3 items-center rounded-control bg-raised`}
          >
            <Text style={tw`text-body font-semibold text-ink-2`}>Leave group</Text>
          </PressableScale>
        </>
      ) : null}
    </ScrollView>
  );
}
