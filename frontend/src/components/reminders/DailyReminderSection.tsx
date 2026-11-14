import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import ReminderTimeList from './ReminderTimeList';
import { toggleFeedback, haptic } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { useReminderStore } from '../../state/useReminderStore';
import { IGNORE_LIMIT, formatReminderTime } from '../../services/reminderPlan';
import {
  disableDailyReminder,
  enableDailyReminder,
  getReminderPermission,
  type ReminderPermission,
} from '../../services/reminders';

/** Settings → Notifications: the local daily check-in reminder (device-only, applies instantly). */
export default function DailyReminderSection() {
  const enabled = useReminderStore((s) => s.enabled);
  const hour = useReminderStore((s) => s.hour);
  const minute = useReminderStore((s) => s.minute);
  const paused = useReminderStore((s) => s.ignoredCount >= IGNORE_LIMIT);
  const [perm, setPerm] = useState<ReminderPermission | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const refreshPerm = useCallback(() => {
    void getReminderPermission().then(setPerm);
  }, []);

  useEffect(() => {
    refreshPerm();
    // Back from iOS Settings → pick up the new permission.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshPerm();
    });
    return () => sub.remove();
  }, [refreshPerm]);

  if (Platform.OS === 'web') return null;

  const blocked = perm != null && !perm.granted && !perm.canAskAgain;
  const needsSettings = blocked || (enabled && perm != null && !perm.granted);
  const timeLabel = formatReminderTime(hour, minute);

  const onToggle = async (next: boolean) => {
    toggleFeedback(next);
    if (!next) {
      disableDailyReminder();
      return;
    }
    setBusy(true);
    try {
      const res = await enableDailyReminder(hour, minute);
      setPerm(res);
      if (res.granted) toast.success(`Daily nudge set for ${timeLabel}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={tw`mb-4`}>
      <Text style={tw`text-caption font-semibold text-ink-3 uppercase tracking-wider mb-2 px-1`}>
        Daily reminder
      </Text>
      <View style={tw`bg-card border border-line rounded-card overflow-hidden`}>
        <View style={tw`flex-row items-center justify-between px-4 py-4 border-b border-line`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={tw`text-ink font-medium`}>Check-in reminder</Text>
            <Text style={tw`text-xs text-ink-3 mt-0.5`}>
              One gentle nudge a day. Skipped when you’ve already checked in.
            </Text>
          </View>
          <Switch
            value={enabled && !needsSettings}
            onValueChange={(v) => void onToggle(v)}
            disabled={busy || blocked}
            accessibilityLabel="Daily check-in reminder"
            trackColor={{ false: tw.color('stone-300'), true: tw.color('emerald-200') }}
            thumbColor={enabled && !needsSettings ? '#059669' : '#F5F5F4'}
          />
        </View>

        <PressableScale
          onPress={() => setPicking(true)}
          disabled={!enabled || needsSettings}
          pressedScale={0.99}
          accessibilityRole="button"
          accessibilityLabel={`Reminder time, ${timeLabel}`}
          accessibilityHint="Choose a different time"
          style={tw`flex-row items-center justify-between px-4 py-4 ${
            enabled && !needsSettings ? '' : 'opacity-50'
          } ${needsSettings || paused ? 'border-b border-line' : ''}`}
        >
          <Text style={tw`text-ink font-medium`}>Time</Text>
          <View style={tw`flex-row items-center`}>
            <Text style={tw`text-ink-2 mr-1`}>{timeLabel}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.iconMuted} />
          </View>
        </PressableScale>

        {needsSettings ? (
          <PressableScale
            onPress={() => void Linking.openSettings().catch(() => undefined)}
            pressedScale={0.99}
            accessibilityRole="button"
            style={tw`flex-row items-center px-4 py-4`}
          >
            <Ionicons name="notifications-off-outline" size={18} color={theme.colors.ink} />
            <View style={tw`flex-1 ml-3`}>
              <Text style={tw`text-ink font-medium`}>Turn on notifications in Settings</Text>
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                Notifications are off for Grow! on this device.
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color={theme.colors.iconMuted} />
          </PressableScale>
        ) : enabled && paused ? (
          <View style={tw`flex-row items-center px-4 py-4`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-ink font-medium`}>Paused for now</Text>
              <Text style={tw`text-xs text-ink-3 mt-0.5`}>
                The last few went by, so we stopped nudging.
              </Text>
            </View>
            <PressableScale
              onPress={() => {
                haptic('commit');
                useReminderStore.getState().resetIgnored();
              }}
              accessibilityRole="button"
              style={tw`px-3 py-2 rounded-chip bg-raised border border-line`}
            >
              <Text style={tw`text-footnote font-semibold text-ink`}>Resume</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>

      <AnimatedBottomSheet visible={picking} onClose={() => setPicking(false)}>
        {({ close }) => (
          <View style={tw`px-gutter-wide pt-2 pb-4`}>
            <Text style={tw`text-title font-bold text-ink mb-1`}>Reminder time</Text>
            <Text style={tw`text-body text-ink-2 mb-4`}>
              We’ll skip it on days you’ve already checked in.
            </Text>
            <ReminderTimeList
              hour={hour}
              minute={minute}
              height={48 * 6}
              onChange={(h, m) => {
                useReminderStore.getState().setTime(h, m);
                close();
              }}
            />
          </View>
        )}
      </AnimatedBottomSheet>
    </View>
  );
}
