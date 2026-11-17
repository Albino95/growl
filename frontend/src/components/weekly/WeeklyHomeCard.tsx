import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import CommitmentRing from './CommitmentRing';
import CommitmentSheet from './CommitmentSheet';
import { getLocalItem, setLocalItem } from '../../services/storage/localStore';
import { haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  getWeeklyCommitment,
  getWeeklyCurrent,
  type WeeklyCommitment,
  type WeeklyCommitmentState,
  type WeeklyCurrent,
} from '../../services/api/weekly';
import {
  commitmentProgressLabel,
  commitmentResultCopy,
  commitmentSubline,
  shouldShowWeeklyCard,
} from './weeklyMeta';

const DISMISS_KEY = 'grow.weekly.dismissed';
const RESULT_SEEN_KEY = 'grow.weekly.resultSeen';

/**
 * Home card for weekly rituals: the opt-in commitment ring (or a "Set a gentle
 * goal" CTA) and, Saturday noon → Monday noon, "Your week in 2 minutes".
 * Self-contained (own fetch, refreshes on focus). Hidden on servers without the
 * weekly module (404) and when dismissed for this week (the weekend check-in
 * reappears even if the weekday card was dismissed).
 */
function WeeklyHomeCard() {
  const navigation = useNavigation<any>();
  const [commit, setCommit] = useState<WeeklyCommitmentState | null>(null);
  const [current, setCurrent] = useState<WeeklyCurrent | null>(null);
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);
  const [sheet, setSheet] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  useEffect(() => {
    void getLocalItem(DISMISS_KEY).then((v) => {
      if (mounted.current) setDismissed(v);
    });
  }, []);

  const load = useCallback(() => {
    getWeeklyCommitment()
      .then((s) => {
        if (mounted.current) setCommit(s);
      })
      .catch(() => {
        /* optional card: keep last good */
      });
    getWeeklyCurrent()
      .then((c) => {
        if (mounted.current) setCurrent(c);
      })
      .catch(() => {
        /* optional card */
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Week-end result: celebrate a kept week once; a gentle "partly counts" otherwise.
  const resultWeek = commit?.last_result?.week ?? null;
  useEffect(() => {
    const r = commit?.last_result;
    if (!r) return;
    void getLocalItem(RESULT_SEEN_KEY).then((seen) => {
      if (seen === r.week || !mounted.current) return;
      void setLocalItem(RESULT_SEEN_KEY, r.week);
      const copy = commitmentResultCopy(r);
      if (r.status === 'kept') {
        haptic('celebrate');
        toast.success(`${copy.title} · ${copy.body}`, { icon: 'ribbon-outline' });
      } else {
        toast.info(`${copy.title}. ${copy.body}`, {
          icon: 'leaf-outline',
          action: { label: 'Set goal', onPress: () => setSheet(true) },
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultWeek]);

  if (!commit && !current) return null;
  if (dismissed === undefined) return null;

  const weekendOpen = !!current?.window.open;
  const weekKey = commit?.week ?? current?.window.week ?? null;
  const dismissKey = weekKey ? (weekendOpen ? `${current!.window.week}:weekend` : weekKey) : null;
  const hidden = !shouldShowWeeklyCard(dismissKey, dismissed);

  const dismiss = () => {
    if (!dismissKey) return;
    setDismissed(dismissKey);
    void setLocalItem(DISMISS_KEY, dismissKey);
  };

  const onCommitmentChanged = (c: WeeklyCommitment | null) => {
    setCommit((prev) => (prev ? { ...prev, commitment: c } : prev));
  };

  const openCheckin = () => {
    navigateFromRoot(navigation, 'WeeklyCheckin');
  };

  const c = commit?.commitment ?? null;
  const answered = !!current?.checkin;
  const sheetEl = (
    <CommitmentSheet
      visible={sheet}
      onClose={() => setSheet(false)}
      commitment={c}
      onChanged={onCommitmentChanged}
    />
  );
  if (hidden) return sheetEl;

  return (
    <View style={tw`mx-gutter mb-3 px-4 pt-4 pb-4 rounded-sheet bg-card border border-line`}>
      <View style={tw`flex-row items-start justify-between`}>
        <Text style={tw`text-caption tracking-[2px] uppercase text-emerald-700 font-semibold`}>
          {weekendOpen ? 'Weekend · your week' : 'This week'}
        </Text>
        <PressableScale
          feedback="close"
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide this week’s card"
        >
          <Ionicons name="close" size={18} color={theme.colors.iconMuted} />
        </PressableScale>
      </View>

      {commit ? (
        c ? (
          <PressableScale
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityHint="Adjust your goal or use a rest pass"
            style={tw`flex-row items-center mt-2`}
          >
            <CommitmentRing commitment={c} />
            <View style={tw`flex-1 ml-4`}>
              <Text style={tw`text-callout font-bold text-ink`}>{commitmentProgressLabel(c)}</Text>
              <Text style={tw`text-footnote text-ink-3 mt-1 leading-5`}>{commitmentSubline(c)}</Text>
              <Text style={tw`text-footnote font-semibold text-emerald-700 mt-1.5`}>Adjust</Text>
            </View>
          </PressableScale>
        ) : (
          <PressableScale
            feedback="open"
            onPress={() => setSheet(true)}
            accessibilityRole="button"
            accessibilityHint="Choose how many days to show up this week"
            style={tw`flex-row items-center mt-2 px-3 py-3 rounded-card bg-raised`}
          >
            <Ionicons name="leaf-outline" size={20} color={theme.colors.brand} />
            <View style={tw`flex-1 ml-3`}>
              <Text style={tw`text-body font-semibold text-ink`}>Set a gentle goal for this week</Text>
              <Text style={tw`text-footnote text-ink-3 mt-0.5`}>3–7 days, with 2 rest passes. No pressure.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
          </PressableScale>
        )
      ) : null}

      {weekendOpen ? (
        <PressableScale
          feedback="open"
          onPress={openCheckin}
          accessibilityRole="button"
          accessibilityLabel={answered ? 'Your week is saved. Open to edit until Monday noon' : 'Your week in 2 minutes'}
          style={tw`flex-row items-center mt-3 px-3 py-3 rounded-card ${answered ? 'bg-raised' : 'bg-emerald-600'}`}
        >
          <Ionicons
            name={answered ? 'checkmark-circle' : 'sparkles-outline'}
            size={18}
            color={answered ? theme.colors.brand : '#FFFFFF'}
          />
          <View style={tw`flex-1 ml-2.5`}>
            <Text style={tw`text-body font-semibold ${answered ? 'text-ink' : 'text-white'}`}>
              {answered ? 'Your week is saved' : 'Your week in 2 minutes'}
            </Text>
            <Text style={tw`text-footnote ${answered ? 'text-ink-3' : 'text-white/80'}`}>
              {answered ? 'You can edit it until Monday noon' : '5 quick questions to close your week'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={answered ? theme.colors.iconMuted : '#FFFFFF'} />
        </PressableScale>
      ) : null}

      {sheetEl}
    </View>
  );
}

export default React.memo(WeeklyHomeCard);
