import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import FormTextInput from '../ui/FormTextInput';
import { assignCohortHomework, type ProofKind } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { KIND_META } from '../proof/proofDefaults';
import { alertMessage } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';
import { dueChoices } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  cohortId: string;
  memberCount: number;
  onAssigned: (assigned: number) => void;
};

const PROOF_OPTIONS: (ProofKind | null)[] = [null, 'photo', 'timer', 'number', 'note'];

/** Coach: one homework for everyone; each member gets their own record. */
export default function CohortAssignSheet({ visible, onClose, cohortId, memberCount, onAssigned }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const dues = useMemo(() => dueChoices(new Date()), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [due, setDue] = useState<string | null>(null);
  const [proofKind, setProofKind] = useState<ProofKind | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDescription('');
      setDue(dues[4]?.key ?? null);
      setProofKind(null);
    }
  }, [visible, dues]);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const r = await assignCohortHomework(cohortId, {
        title: title.trim(),
        description: description.trim() || null,
        due_at: due,
        proof_kind: proofKind,
      });
      haptic('success');
      onAssigned(r.assigned);
    } catch (e) {
      void alertMessage('Couldn’t assign that', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean, label: string, onPress: () => void, a11y: string) => (
    <PressableScale
      key={a11y}
      feedback="chip"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
      style={tw`px-3 py-1.5 rounded-chip border ${on ? 'bg-emerald-600 border-emerald-600' : 'bg-card border-line'}`}
    >
      <Text style={tw`text-footnote font-semibold ${on ? 'text-white' : 'text-ink-2'}`}>{label}</Text>
    </PressableScale>
  );

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} keyboardAware maxHeightRatio={0.9}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={tw`px-gutter pt-1 pb-8`}>
        <Text style={tw`text-title font-bold text-ink`}>Group homework</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1`}>
          Goes to all {memberCount} {memberCount === 1 ? 'member' : 'members'}. Each one finishes it on their own;
          only you see who did.
        </Text>
        <FormTextInput
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          placeholder="e.g. 3 × 10 squats, three days this week"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Homework title"
          style={tw`mt-4 bg-raised rounded-control px-3.5 py-3 text-body text-ink`}
        />
        <FormTextInput
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          multiline
          placeholder="Details (optional)"
          placeholderTextColor={theme.colors.placeholder}
          accessibilityLabel="Homework details"
          style={tw`mt-2 bg-raised rounded-control px-3.5 py-3 text-body text-ink min-h-20`}
        />
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-4 mb-1.5`}>Due</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
          {dues.map((d) => chip(d.key === due, d.label, () => setDue(d.key), `Due: ${d.label}`))}
        </ScrollView>
        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-4 mb-1.5`}>
          Ask for proof
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tw`gap-2`}>
          {PROOF_OPTIONS.map((k) =>
            chip(
              k === proofKind,
              k ? `${KIND_META[k].emoji} ${KIND_META[k].label}` : 'No proof needed',
              () => setProofKind(k),
              `Proof: ${k ? KIND_META[k].label : 'none'}`
            )
          )}
        </ScrollView>
        <Text style={tw`text-footnote text-ink-3 mt-2 leading-5`}>
          Proof is a gentle ask — members can always just tap Done.
        </Text>
        <PrimaryButton
          label="Assign to everyone"
          disabled={!title.trim()}
          loading={busy}
          onPress={() => void submit()}
          style={tw`mt-5`}
        />
        <Text style={tw`text-footnote text-ink-3 mt-2 text-center`}>
          People who join later get it too while it’s still open.
        </Text>
      </ScrollView>
    </AnimatedBottomSheet>
  );
}
