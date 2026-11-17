import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { listFriends, type FriendSummary } from '../../services/api/friends';
import type { BuddiesPayload } from '../../services/api/buddies';

type Props = {
  visible: boolean;
  onClose: () => void;
  data: BuddiesPayload | null;
  onPick: (friend: FriendSummary) => Promise<void> | void;
};

/** Bottom sheet: pick a friend to invite as a path buddy. */
export default function BuddyFriendPicker({ visible, onClose, data, onPick }: Props) {
  const [friends, setFriends] = useState<FriendSummary[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void listFriends().then((f) => {
      if (alive) setFriends(f);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const taken = useMemo(() => {
    const s = new Set<string>();
    for (const b of data?.buddies ?? []) s.add(b.user.id);
    for (const i of data?.invites_out ?? []) s.add(i.user.id);
    for (const i of data?.invites_in ?? []) s.add(i.user.id);
    return s;
  }, [data]);

  const options = (friends ?? []).filter((f) => !taken.has(f.id));

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.7}>
      <View style={tw`px-gutter pt-1 pb-6`}>
        <Text style={tw`text-title font-bold text-ink`}>Grow with a friend</Text>
        <Text style={tw`text-sm text-ink-2 mt-1 mb-3 leading-5`}>
          When you both show up on the same day — a post, a journal page, a check-in, even a rest day — your
          shared streak grows.
        </Text>
        {friends === null ? (
          <ActivityIndicator style={tw`my-8`} color={theme.colors.brand} />
        ) : options.length === 0 ? (
          <Text style={tw`text-sm text-ink-3 my-6 text-center`}>
            {friends.length === 0
              ? 'Add a friend first — buddies are picked from your circle.'
              : 'Everyone in your circle is already a buddy or invited.'}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {options.map((f) => (
              <PressableScale
                key={f.id}
                feedback={false}
                disabled={!!busyId}
                onPress={async () => {
                  setBusyId(f.id);
                  try {
                    await onPick(f);
                  } finally {
                    setBusyId(null);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Invite ${f.username} as a buddy`}
                style={tw`flex-row items-center py-2.5`}
              >
                <GrowAvatar userId={f.id} username={f.username} uri={f.avatar ?? null} size={36} />
                <Text style={tw`flex-1 ml-3 text-body font-semibold text-ink`} numberOfLines={1}>
                  {f.username}
                </Text>
                {busyId === f.id ? (
                  <ActivityIndicator color={theme.colors.brand} />
                ) : (
                  <View style={tw`flex-row items-center px-3 py-1.5 rounded-chip bg-emerald-50 border border-emerald-100`}>
                    <Ionicons name="add" size={14} color={theme.colors.leafInk} />
                    <Text style={tw`ml-0.5 text-xs font-semibold text-emerald-900`}>Invite</Text>
                  </View>
                )}
              </PressableScale>
            ))}
          </ScrollView>
        )}
      </View>
    </AnimatedBottomSheet>
  );
}
