import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { useGrowthStore } from '../../state/useGrowthStore';
import { useAuth } from '../../store/hooks';
import { confirmAsync } from '../../utils/confirmDialog';
import { cheerProof, deleteProof, type Proof } from '../../services/api/proofs';
import ProofMedia from './ProofMedia';
import { KIND_META, proofSummary } from './proofDefaults';

type Props = {
  visible: boolean;
  proof: Proof | null;
  onClose: () => void;
  onDeleted?: (id: string) => void;
  onChanged?: (p: Proof) => void;
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Full-screen proof: photo, voice playback, timer/number display, note.
 * Owner can delete; people it's shared with can cheer.
 */
export default function ProofViewer({ visible, proof, onClose, onDeleted, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [current, setCurrent] = useState<Proof | null>(proof);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCurrent(proof);
  }, [proof]);

  if (!current) return null;
  const isOwner = !!user?.id && user.id === current.user_id;
  const meta = KIND_META[current.kind];
  const hasMedia = current.kind === 'photo' || current.kind === 'voice';

  const onDelete = async () => {
    if (busy) return;
    const ok = await confirmAsync('Delete this proof?', 'Your check-in stays — only the proof is removed.', {
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteProof(current.id);
      haptic('success');
      useGrowthStore.getState().removeProof(current.id);
      toast.info('Proof deleted');
      onDeleted?.(current.id);
      onClose();
    } catch {
      haptic('error');
      toast.info('Couldn’t delete just now. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCheer = async () => {
    if (busy) return;
    const was = current;
    const optimistic = {
      ...was,
      cheered_by_me: !was.cheered_by_me,
      cheers: Math.max(0, was.cheers + (was.cheered_by_me ? -1 : 1)),
    };
    haptic(optimistic.cheered_by_me ? 'like' : 'unlike');
    setCurrent(optimistic);
    try {
      const res = await cheerProof(was.id);
      const next = { ...optimistic, ...res };
      setCurrent(next);
      onChanged?.(next);
    } catch {
      setCurrent(was);
      toast.info('Couldn’t cheer just now.');
    }
  };

  const summary = proofSummary(current);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[tw`flex-1 bg-black`, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={tw`flex-row items-center justify-between px-4 py-2`}>
          <PressableScale
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close proof"
            style={tw`w-9 h-9 rounded-full bg-white/15 items-center justify-center`}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </PressableScale>
          <Text style={tw`text-footnote font-semibold text-white/80`}>
            {meta.emoji} {meta.label} proof
          </Text>
          {isOwner ? (
            <PressableScale
              onPress={() => void onDelete()}
              disabled={busy}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Delete proof"
              style={tw`w-9 h-9 rounded-full bg-white/15 items-center justify-center`}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
            </PressableScale>
          ) : (
            <View style={tw`w-9`} />
          )}
        </View>

        <ScrollView contentContainerStyle={tw`flex-grow justify-center px-4`}>
          {current.kind === 'photo' ? (
            <ProofMedia proof={current} style={tw`w-full h-[480px] rounded-card`} contentFit="contain" dark />
          ) : null}
          {current.kind === 'voice' ? (
            <View style={tw`px-4 py-6 rounded-card bg-white/10`}>
              <ProofMedia proof={current} style={tw`w-full`} dark />
            </View>
          ) : null}
          {current.kind === 'timer' || current.kind === 'number' ? (
            <View style={tw`items-center py-10`}>
              <Text style={[tw`text-[64px] font-extrabold text-white`, { fontVariant: ['tabular-nums'] }]}>
                {current.kind === 'timer' ? current.minutes ?? 0 : current.number ?? 0}
              </Text>
              <Text style={tw`text-title font-semibold text-white/80`}>
                {current.kind === 'timer' ? 'minutes focused' : current.unit || ''}
              </Text>
            </View>
          ) : null}
          {current.text && (current.kind === 'note' || hasMedia) ? (
            <Text style={tw`text-callout text-white text-center mt-5 leading-6`}>“{current.text}”</Text>
          ) : null}
          {!current.text && !hasMedia && current.kind === 'note' ? (
            <Text style={tw`text-callout text-white text-center`}>{summary}</Text>
          ) : null}
        </ScrollView>

        <View style={tw`px-5 pt-3 pb-4`}>
          <Text style={tw`text-caption text-white/60`}>{whenLabel(current.created_at)}</Text>
          <View style={tw`flex-row items-center flex-wrap gap-x-3 gap-y-1 mt-1.5`}>
            <Text style={tw`text-caption text-white/80`}>
              {current.shared_with_coach ? '👀 Shared with your coach' : isOwner ? '🔒 Private' : ''}
            </Text>
            {current.seen_by_coach_at ? <Text style={tw`text-caption text-emerald-300`}>Seen by coach ✓</Text> : null}
            {current.cheers > 0 ? (
              <Text style={tw`text-caption text-white/80`}>
                👏 {current.cheers} {current.cheers === 1 ? 'cheer' : 'cheers'}
              </Text>
            ) : null}
          </View>
          {!isOwner ? (
            <PressableScale
              onPress={() => void onCheer()}
              accessibilityRole="button"
              accessibilityState={{ selected: current.cheered_by_me }}
              accessibilityLabel={current.cheered_by_me ? 'Remove cheer' : 'Cheer this proof'}
              style={tw`mt-3 py-3 rounded-control items-center ${current.cheered_by_me ? 'bg-white/20' : 'bg-emerald-600'}`}
            >
              <Text style={tw`text-body font-bold text-white`}>
                {current.cheered_by_me ? 'Cheered 👏' : 'Cheer 👏'}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
