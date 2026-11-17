import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import PrimaryButton from '../ui/PrimaryButton';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { iconSize } from '../../theme/icons';
import {
  COMMITMENT_MAX,
  COMMITMENT_MIN,
  applyRestPass,
  removeWeeklyCommitment,
  setWeeklyCommitment,
  undoRestPass,
  type WeeklyCommitment,
} from '../../services/api/weekly';
import { weekdayName } from './weeklyMeta';

type Props = {
  visible: boolean;
  onClose: () => void;
  commitment: WeeklyCommitment | null;
  onChanged: (c: WeeklyCommitment | null) => void;
};

const TARGETS = Array.from({ length: COMMITMENT_MAX - COMMITMENT_MIN + 1 }, (_, i) => COMMITMENT_MIN + i);

function errMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Please try again.';
}

/**
 * Set (or change) "Show up X days this week" and spend the 2 rest passes.
 * Passes only cover a day for this goal — the growth streak and its rest days
 * are untouched.
 */
export default function CommitmentSheet({ visible, onClose, commitment, onChanged }: Props) {
  const [target, setTarget] = useState(commitment?.target_days ?? 4);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setTarget(commitment?.target_days ?? 4);
  }, [visible, commitment?.target_days]);

  const save = async (close: () => void) => {
    if (busy) return;
    setBusy('save');
    try {
      const c = await setWeeklyCommitment(target);
      haptic('commit');
      onChanged(c);
      toast.success(commitment ? 'Goal updated' : `Gentle goal set: ${target} days`, { icon: 'leaf-outline' });
      close();
    } catch (e) {
      void alertMessage('Couldn’t save your goal', errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const togglePass = async (day: string, isPass: boolean) => {
    if (busy) return;
    setBusy(day);
    try {
      const c = isPass ? await undoRestPass(day) : await applyRestPass(day);
      haptic(isPass ? 'toggleOff' : 'toggleOn');
      onChanged(c);
    } catch (e) {
      void alertMessage('Couldn’t use a rest pass', errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (close: () => void) => {
    const ok = await confirmAsync('Remove this week’s goal?', 'No worries — you can set a new one anytime.', {
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy('remove');
    try {
      await removeWeeklyCommitment();
      onChanged(null);
      close();
    } catch (e) {
      void alertMessage('Couldn’t remove the goal', errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const passesLeft = commitment ? commitment.passes_total - commitment.passes_used : 0;
  const passDays = commitment
    ? commitment.days.filter((d) => d.status === 'pass' || d.status === 'open' || d.status === 'today')
    : [];

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.8}>
      {({ close }) => (
        <View style={tw`px-gutter pb-4`}>
          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text accessibilityRole="header" style={tw`text-title font-bold text-ink`}>
              {commitment ? 'Your week' : 'A gentle goal'}
            </Text>
            <PressableScale
              onPress={close}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={iconSize.md} color={theme.colors.iconMuted} />
            </PressableScale>
          </View>
          <Text style={tw`text-footnote text-ink-3 leading-5 mb-4`}>
            Show up on a few days this week. Any check-in, journal page or post counts. You get 2 rest
            passes — they only count for this goal and never touch your streak.
          </Text>

          <Text style={tw`text-caption uppercase tracking-[1.5px] text-ink-3 font-semibold mb-2`}>
            Show up
          </Text>
          <View style={tw`flex-row gap-2 mb-1`} accessibilityRole="radiogroup">
            {TARGETS.map((n) => {
              const on = n === target;
              return (
                <PressableScale
                  key={n}
                  feedback="chip"
                  onPress={() => setTarget(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${n} days`}
                  style={tw`flex-1 items-center py-3 rounded-control border ${
                    on ? 'bg-emerald-600 border-emerald-600' : 'bg-raised border-line'
                  }`}
                >
                  <Text style={tw`text-callout font-bold ${on ? 'text-white' : 'text-ink'}`}>{n}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={tw`text-caption text-ink-3 mb-4`}>days this week</Text>

          <PrimaryButton
            label={commitment ? (commitment.target_days === target ? 'Keep this goal' : 'Update goal') : 'Set my goal'}
            loading={busy === 'save'}
            onPress={() => void save(close)}
          />

          {commitment && passDays.length > 0 ? (
            <View style={tw`mt-5`}>
              <Text style={tw`text-caption uppercase tracking-[1.5px] text-ink-3 font-semibold mb-1`}>
                Rest passes · {passesLeft} left
              </Text>
              <Text style={tw`text-footnote text-ink-3 mb-2`}>Cover a day you needed off.</Text>
              <View style={tw`gap-2`}>
                {passDays.map((d) => {
                  const isPass = d.status === 'pass';
                  const disabled = !isPass && passesLeft <= 0;
                  return (
                    <PressableScale
                      key={d.day}
                      disabled={disabled || busy !== null}
                      onPress={() => void togglePass(d.day, isPass)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled, selected: isPass }}
                      accessibilityLabel={
                        isPass ? `Undo rest pass on ${weekdayName(d.day)}` : `Use a rest pass on ${weekdayName(d.day)}`
                      }
                      style={tw`flex-row items-center justify-between px-3 py-2.5 rounded-card bg-raised ${
                        disabled ? 'opacity-50' : ''
                      }`}
                    >
                      <Text style={tw`text-body text-ink`}>
                        {weekdayName(d.day)}
                        {d.status === 'today' ? ' · today' : ''}
                      </Text>
                      <View style={tw`flex-row items-center gap-1`}>
                        <Ionicons
                          name={isPass ? 'leaf' : 'leaf-outline'}
                          size={16}
                          color={isPass ? theme.colors.brand : theme.colors.iconMuted}
                        />
                        <Text style={tw`text-footnote font-semibold ${isPass ? 'text-emerald-700' : 'text-ink-2'}`}>
                          {isPass ? 'Covered' : 'Use pass'}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ) : null}

          {commitment ? (
            <PressableScale
              onPress={() => void remove(close)}
              accessibilityRole="button"
              style={tw`self-center mt-4 px-3 py-2`}
            >
              <Text style={tw`text-footnote text-ink-3`}>Remove this week’s goal</Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
