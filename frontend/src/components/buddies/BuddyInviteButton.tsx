import React, { useEffect, useState } from 'react';
import { Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { iconSize } from '../../theme/icons';
import PressableScale from '../ui/PressableScale';
import { buddySlotsUsed, buddyStateFor, useBuddyStore } from '../../state/useBuddyStore';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import { ApiError } from '../../services/api/http';
import { toast } from '../../state/useToastStore';
import { alertMessage } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';

type Props = {
  userId: string;
  /** Only friends can be buddies — hidden otherwise. */
  isFriend: boolean;
  name: string;
};

/** PublicProfile: "Invite as buddy" → Pending → Buddies (tap opens Buddies). */
export default function BuddyInviteButton({ userId, isFriend, name }: Props) {
  const navigation = useNavigation<any>();
  const data = useBuddyStore((s) => s.data);
  const status = useBuddyStore((s) => s.status);
  const load = useBuddyStore((s) => s.load);
  const invite = useBuddyStore((s) => s.invite);
  const accept = useBuddyStore((s) => s.accept);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isFriend) void load();
  }, [isFriend, load]);

  if (!isFriend || status === 'unavailable' || status === 'idle') return null;
  if (status !== 'ready' && !data) return null;

  const rel = buddyStateFor(data, userId);
  const full = buddySlotsUsed(data) >= (data?.max ?? 5);

  const onPress = async () => {
    if (busy) return;
    if (rel.kind === 'buddies' || rel.kind === 'pending_out') {
      navigateFromRoot(navigation, 'Buddies');
      return;
    }
    setBusy(true);
    try {
      if (rel.kind === 'pending_in') {
        await accept(rel.id);
        haptic('success');
        toast.success(`You and ${name} are buddies now`);
      } else {
        if (full) {
          void alertMessage('Your buddy circle is full', 'You can grow with up to 5 buddies at a time. End one from Buddies to make room.');
          return;
        }
        await invite(userId);
        haptic('success');
        toast.success(`Buddy invite sent to ${name}`);
      }
    } catch (e) {
      const msg = e instanceof ApiError && e.message ? e.message : 'Please try again in a moment.';
      void alertMessage('Couldn’t send that', msg);
      void load({ force: true });
    } finally {
      setBusy(false);
    }
  };

  const label =
    rel.kind === 'buddies'
      ? 'Buddies'
      : rel.kind === 'pending_out'
        ? 'Buddy invite pending'
        : rel.kind === 'pending_in'
          ? 'Accept buddy invite'
          : 'Invite as buddy';
  const icon =
    rel.kind === 'buddies' ? 'leaf' : rel.kind === 'pending_out' ? 'time-outline' : 'people-outline';
  const solid = rel.kind === 'pending_in';

  return (
    <PressableScale
      onPress={() => void onPress()}
      disabled={busy}
      feedback={rel.kind === 'none' ? 'commit' : false}
      accessibilityRole="button"
      accessibilityLabel={rel.kind === 'none' ? `Invite ${name} as a path buddy` : label}
      accessibilityHint={rel.kind === 'none' ? 'Start a shared streak together' : undefined}
      style={tw`py-2.5 rounded-card flex-row items-center justify-center gap-1.5 ${
        solid ? 'bg-emerald-600' : 'bg-card border border-line'
      } ${busy ? 'opacity-60' : ''}`}
    >
      {busy ? (
        <ActivityIndicator color={solid ? '#fff' : theme.colors.brand} />
      ) : (
        <Ionicons name={icon} size={iconSize.sm} color={solid ? '#fff' : theme.colors.leafInk} />
      )}
      <Text style={tw`font-semibold text-sm ${solid ? 'text-white' : 'text-ink'}`}>{label}</Text>
    </PressableScale>
  );
}
