import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PrimaryButton from '../ui/PrimaryButton';
import PressableScale from '../ui/PressableScale';
import ReminderTimeList from './ReminderTimeList';
import { formatReminderTime } from '../../services/reminderPlan';

type Props = {
  visible: boolean;
  /** Preselected time (the hour of the first check-in, rounded to :00 / :30). */
  hour: number;
  minute: number;
  onAllow: (hour: number, minute: number) => void;
  onNotNow: () => void;
};

/**
 * Soft in-app ask shown once after the first check-in, before any system prompt.
 * "Allow" → OS permission prompt; "Not now" (or swipe away) → not again for a week.
 */
export default function ReminderAskSheet({ visible, hour, minute, onAllow, onNotNow }: Props) {
  const [time, setTime] = useState({ hour, minute });
  const [picking, setPicking] = useState(false);
  /** Set by "Yes" so the close animation ends in onAllow instead of onNotNow. */
  const allowed = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setTime({ hour, minute });
    setPicking(false);
    allowed.current = false;
  }, [visible, hour, minute]);

  const label = formatReminderTime(time.hour, time.minute);

  return (
    <AnimatedBottomSheet
      visible={visible}
      onClose={() => (allowed.current ? onAllow(time.hour, time.minute) : onNotNow())}
    >
      {({ close }) => (
        <View style={tw`px-gutter-wide pt-2 pb-4`}>
          <View style={tw`w-11 h-11 rounded-full bg-raised items-center justify-center mb-3`}>
            <Ionicons name="sunny-outline" size={22} color={theme.colors.brand} />
          </View>
          <Text style={tw`text-title font-bold text-ink`} accessibilityRole="header">
            Want a gentle nudge each day?
          </Text>
          <Text style={tw`text-body text-ink-2 mt-1 mb-4`}>
            One quiet reminder, only on days you haven’t checked in yet. Change or turn it off any
            time in Settings.
          </Text>

          <PressableScale
            onPress={() => setPicking((p) => !p)}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={`Reminder time, ${label}`}
            accessibilityHint="Choose a different time"
            accessibilityState={{ expanded: picking }}
            style={tw`flex-row items-center justify-between bg-raised border border-line rounded-card px-4 py-3 mb-3`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="time-outline" size={18} color={theme.colors.ink} />
              <Text style={tw`text-body text-ink ml-2`}>Around {label}</Text>
            </View>
            <Text style={tw`text-footnote font-semibold text-ink-3`}>
              {picking ? 'Done' : 'Change'}
            </Text>
          </PressableScale>

          {picking ? (
            <View style={tw`mb-4`}>
              <ReminderTimeList
                hour={time.hour}
                minute={time.minute}
                onChange={(h, m) => setTime({ hour: h, minute: m })}
                height={48 * 4}
              />
            </View>
          ) : null}

          <PrimaryButton
            label="Yes, remind me"
            onPress={() => {
              allowed.current = true;
              close();
            }}
          />
          <PressableScale
            onPress={close}
            accessibilityRole="button"
            style={tw`items-center py-3 mt-1`}
          >
            <Text style={tw`text-body font-medium text-ink-2`}>Not now</Text>
          </PressableScale>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
