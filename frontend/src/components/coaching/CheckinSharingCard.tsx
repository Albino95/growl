import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import {
  getCheckinSummary,
  setCheckinSharing,
  type CheckinSummary,
} from '../../services/api/coaching';
import { feedback } from '../../utils/interactionFeedback';
import { toast } from '../../state/useToastStore';
import { alertMessage } from '../../utils/confirmDialog';
import { moodLabel } from './planProgress';
import { parseApiDate } from './homeworkDates';

type Props = {
  contractId: string;
  isCoach: boolean;
  /** Server value from the plan; the client's switch starts here (default off). */
  shared: boolean;
  active: boolean;
  /** Bump to reload (e.g. on pull-to-refresh). */
  reloadKey?: number;
  onSharedChange?: (shared: boolean) => void;
};

function weekdayLetter(day: string): string {
  const d = parseApiDate(`${day}T12:00:00Z`);
  if (!d) return '';
  try {
    return d.toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' });
  } catch {
    return 'MTWTFSS'[(d.getUTCDay() + 6) % 7];
  }
}

/**
 * Weekly Today check-in summary on a coaching plan.
 * Client: explicit opt-in switch (default OFF) + a preview of what the coach would see.
 * Coach: the summary only when the client has opted in.
 */
export default function CheckinSharingCard({
  contractId,
  isCoach,
  shared,
  active,
  reloadKey,
  onSharedChange,
}: Props) {
  const [on, setOn] = useState(shared);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<CheckinSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => setOn(shared), [shared]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCheckinSummary(contractId);
      setSummary(res.summary);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey, on]);

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setOn(next);
    try {
      const saved = await setCheckinSharing(contractId, next);
      setOn(saved);
      onSharedChange?.(saved);
      feedback.select();
      toast.success(saved ? 'Your coach can now see your check-ins' : 'Check-ins are private again');
    } catch (e) {
      setOn(!next);
      feedback.error();
      void alertMessage('Sharing', e instanceof Error ? e.message : 'Could not update sharing');
    } finally {
      setBusy(false);
    }
  };

  const showSummary = isCoach ? on && !!summary : !!summary;

  return (
    <View style={tw`mt-3 px-4 py-3.5 rounded-card bg-card border border-line/80`}>
      <View style={tw`flex-row items-center justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>
            {isCoach ? 'This week’s check-ins' : 'Share Today check-ins'}
          </Text>
          <Text style={tw`text-footnote text-ink-2 mt-1 leading-5`}>
            {isCoach
              ? on
                ? 'Shared by your client. Mood, intention and follow-through from the last 7 days.'
                : 'Not shared. Your client decides — you’ll see a weekly summary if they turn it on.'
              : on
                ? 'Your coach sees your mood, intention and follow-through for the last 7 days.'
                : 'Off. Your check-ins stay private. Turn on to let your coach see a weekly summary.'}
          </Text>
        </View>
        {!isCoach ? (
          busy ? (
            <ActivityIndicator color={theme.colors.brand} />
          ) : (
            <Switch
              value={on}
              onValueChange={(v) => void toggle(v)}
              disabled={!active && !on}
              trackColor={{ true: theme.colors.brand, false: theme.colors.line }}
              accessibilityLabel="Share my Today check-ins with my coach"
              accessibilityHint="Your coach sees a 7-day summary only while this is on"
            />
          )
        ) : (
          <Ionicons
            name={on ? 'eye-outline' : 'lock-closed-outline'}
            size={18}
            color={theme.colors.iconMuted}
          />
        )}
      </View>

      {loading && (isCoach ? on : true) ? (
        <ActivityIndicator color={theme.colors.brand} style={tw`mt-3`} />
      ) : failed ? (
        <PressableScale onPress={() => void load()} accessibilityRole="button" style={tw`mt-2 py-1`}>
          <Text style={tw`text-footnote font-semibold text-emerald-700`}>Couldn’t load · Try again</Text>
        </PressableScale>
      ) : showSummary && summary ? (
        <View style={tw`mt-3`}>
          {!isCoach ? (
            <Text style={tw`text-caption text-ink-3 mb-1.5`}>
              {on ? 'What your coach sees' : 'Preview — only you can see this'}
            </Text>
          ) : null}
          <View
            style={tw`flex-row justify-between`}
            accessible
            accessibilityLabel={`Checked in ${summary.checked_in_days} of 7 days`}
          >
            {summary.days.map((d) => (
              <View key={d.day} style={tw`items-center`}>
                <View
                  style={tw`w-7 h-7 rounded-full items-center justify-center ${
                    d.checked_in ? (d.rest ? 'bg-raised border border-line' : 'bg-emerald-600') : 'bg-raised'
                  }`}
                >
                  {d.checked_in ? (
                    <Ionicons
                      name={d.rest ? 'moon-outline' : 'checkmark'}
                      size={13}
                      color={d.rest ? theme.colors.ink2 : '#fff'}
                    />
                  ) : null}
                </View>
                <Text style={tw`text-caption text-ink-3 mt-1`}>{weekdayLetter(d.day)}</Text>
              </View>
            ))}
          </View>
          <Text style={tw`text-footnote text-ink-2 mt-2`}>
            {summary.checked_in_days}/7 days · mood {moodLabel(summary.avg_mood)}
            {summary.avg_mood != null ? ` (${summary.avg_mood})` : ''} · followed through{' '}
            {summary.followed_through}×{summary.rest_days ? ` · ${summary.rest_days} rest` : ''}
          </Text>
          {summary.days
            .filter((d) => d.intention)
            .slice(-3)
            .reverse()
            .map((d) => (
              <Text key={`i-${d.day}`} style={tw`text-footnote text-ink-3 mt-1`} numberOfLines={1}>
                “{d.intention}”
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}
