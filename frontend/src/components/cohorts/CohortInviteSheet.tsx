import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import GrowAvatar from '../ui/GrowAvatar';
import {
  inviteToCohort,
  listInviteCandidates,
  rotateCohortCode,
  type Cohort,
  type InviteCandidate,
} from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import { formatCode, personName, shareMessage } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  cohort: Cohort;
  onCodeChanged: (code: string, link: string) => void;
};

/** Coach: share the group code, rotate it, or invite clients / friends directly. */
export default function CohortInviteSheet({ visible, onClose, cohort, onCodeChanged }: Props) {
  const [cands, setCands] = useState<InviteCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setCands(null);
    setPicked(new Set());
    listInviteCandidates(cohort.id)
      .then((c) => alive && setCands(c))
      .catch(() => alive && setCands([]));
    return () => {
      alive = false;
    };
  }, [visible, cohort.id]);

  const share = async () => {
    try {
      await Share.share({ message: shareMessage(cohort, personName(cohort.coach)) });
    } catch {
      /* dismissed */
    }
  };

  const rotate = async () => {
    const ok = await confirmAsync(
      'Make a new code?',
      'The old code stops working. People already in the group stay in.',
      { confirmLabel: 'New code', cancelLabel: 'Keep' }
    );
    if (!ok) return;
    setRotating(true);
    try {
      const r = await rotateCohortCode(cohort.id);
      onCodeChanged(r.invite_code, r.invite_link);
      haptic('success');
    } catch (e) {
      void alertMessage('Couldn’t change the code', e instanceof ApiError ? e.message : undefined);
    } finally {
      setRotating(false);
    }
  };

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else if (n.size < 50) n.add(id);
      return n;
    });

  const send = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    try {
      const r = await inviteToCohort(cohort.id, [...picked]);
      haptic('success');
      toast.success(r.invited === 1 ? 'Invite sent' : `${r.invited} invites sent`);
      setCands((c) => (c ?? []).map((x) => (picked.has(x.user.id) ? { ...x, invited: true } : x)));
      setPicked(new Set());
    } catch (e) {
      void alertMessage('Couldn’t send invites', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const full = cohort.spots_left <= 0;

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.85}>
      <ScrollView contentContainerStyle={tw`px-gutter pt-1 pb-8`} showsVerticalScrollIndicator={false}>
        <Text style={tw`text-title font-bold text-ink`}>Invite to {cohort.title}</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1`}>
          {full ? 'The group is full — raise the spots to invite more.' : `${cohort.spots_left} spots left.`}
        </Text>

        <View style={tw`mt-4 bg-card border border-line rounded-card px-4 py-4 items-center`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>Group code</Text>
          <Text
            selectable
            accessibilityLabel={`Group code ${(cohort.invite_code ?? '').split('').join(' ')}`}
            style={tw`text-3xl font-bold text-ink mt-1 tracking-widest`}
          >
            {formatCode(cohort.invite_code)}
          </Text>
          <View style={tw`flex-row gap-2 mt-3`}>
            <PressableScale
              feedback="open"
              onPress={() => void share()}
              accessibilityRole="button"
              accessibilityLabel="Share group code"
              style={tw`flex-row items-center px-4 py-2.5 rounded-control bg-emerald-600`}
            >
              <Ionicons name="share-outline" size={16} color="#fff" />
              <Text style={tw`ml-1.5 text-footnote font-semibold text-white`}>Share code</Text>
            </PressableScale>
            <PressableScale
              feedback={false}
              disabled={rotating}
              onPress={() => void rotate()}
              accessibilityRole="button"
              accessibilityLabel="Make a new code"
              style={tw`flex-row items-center px-4 py-2.5 rounded-control bg-raised ${rotating ? 'opacity-60' : ''}`}
            >
              <Ionicons name="refresh" size={16} color={theme.colors.ink} />
              <Text style={tw`ml-1.5 text-footnote font-semibold text-ink`}>New code</Text>
            </PressableScale>
          </View>
        </View>

        <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mt-5 mb-2`}>
          Your clients and friends
        </Text>
        {cands === null ? (
          <ActivityIndicator style={tw`my-6`} color={theme.colors.brand} />
        ) : cands.length === 0 ? (
          <Text style={tw`text-footnote text-ink-3 my-4 text-center`}>
            Everyone you coach or follow as a friend is already here — share the code instead.
          </Text>
        ) : (
          <View style={tw`gap-1`}>
            {cands.map((c) => {
              const on = picked.has(c.user.id);
              return (
                <PressableScale
                  key={c.user.id}
                  feedback={c.invited ? false : 'selection'}
                  disabled={c.invited}
                  onPress={() => toggle(c.user.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: c.invited }}
                  accessibilityLabel={`${personName(c.user)}, ${c.source}${c.invited ? ', invited' : ''}`}
                  style={tw`flex-row items-center py-2`}
                >
                  <GrowAvatar userId={c.user.id} username={c.user.username} uri={c.user.avatar_url} size={36} />
                  <View style={tw`flex-1 ml-3`}>
                    <Text style={tw`text-body text-ink font-semibold`} numberOfLines={1}>
                      {personName(c.user)}
                    </Text>
                    <Text style={tw`text-footnote text-ink-3`}>{c.source === 'client' ? 'Client' : 'Friend'}</Text>
                  </View>
                  {c.invited ? (
                    <Text style={tw`text-footnote text-ink-3`}>Invited</Text>
                  ) : (
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={on ? theme.colors.brand : theme.colors.iconMuted}
                    />
                  )}
                </PressableScale>
              );
            })}
          </View>
        )}
        {cands && cands.length ? (
          <PrimaryButton
            label={picked.size ? `Invite ${picked.size}` : 'Pick people to invite'}
            disabled={!picked.size || full}
            loading={busy}
            onPress={() => void send()}
            style={tw`mt-4`}
          />
        ) : null}
      </ScrollView>
    </AnimatedBottomSheet>
  );
}
