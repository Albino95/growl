import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PrimaryButton from '../ui/PrimaryButton';
import PressableScale from '../ui/PressableScale';

type Props = {
  visible: boolean;
  onKeep: () => void;
  onTurnOff: () => void;
  /** Swiped away: stay paused, ask again another day. */
  onDismiss: () => void;
};

/** Shown on the next open after a few reminders in a row went by unanswered (reminders are paused). */
export default function ReminderQuietSheet({ visible, onKeep, onTurnOff, onDismiss }: Props) {
  return (
    <AnimatedBottomSheet visible={visible} onClose={onDismiss}>
      {({ close }) => (
        <View style={tw`px-gutter-wide pt-2 pb-4`}>
          <View style={tw`w-11 h-11 rounded-full bg-raised items-center justify-center mb-3`}>
            <Ionicons name="moon-outline" size={22} color={theme.colors.brand} />
          </View>
          <Text style={tw`text-title font-bold text-ink`} accessibilityRole="header">
            Still want a daily nudge?
          </Text>
          <Text style={tw`text-body text-ink-2 mt-1 mb-5`}>
            The last few went by — that’s okay. We’ve paused them for now so they don’t pile up.
          </Text>
          <PrimaryButton
            label="Keep reminders"
            onPress={() => {
              onKeep();
              close();
            }}
          />
          <PressableScale
            onPress={() => {
              onTurnOff();
              close();
            }}
            accessibilityRole="button"
            style={tw`items-center py-3 mt-1`}
          >
            <Text style={tw`text-body font-medium text-ink-2`}>Turn off</Text>
          </PressableScale>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
