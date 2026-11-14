import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { feedback } from '../../utils/interactionFeedback';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirm sheet before sharing a journal entry with Circle. */
export default function GoingPublicSheet({ visible, onCancel, onConfirm }: Props) {
  return (
    <AnimatedBottomSheet visible={visible} onClose={onCancel} maxHeightRatio={0.55}>
      {({ close }) => (
        <View style={tw`px-gutter-wide pt-1 pb-4`}>
          <View style={tw`flex-row items-center mb-3`}>
            <View style={tw`w-11 h-11 rounded-full bg-emerald-50 items-center justify-center mr-3`}>
              <Ionicons name="people-outline" size={22} color={theme.colors.brand} />
            </View>
            <Text style={tw`text-title font-bold text-ink flex-1`}>Share with your circle?</Text>
          </View>
          <Text style={tw`text-body text-ink-2 leading-6 mb-5`}>
            Friends may see this in Journal → Voices and can message you about it. Private entries
            stay only yours.
          </Text>

          <PressableScale
            onPress={() => {
              feedback.success();
              onConfirm();
            }}
            style={tw`bg-emerald-600 rounded-card py-4 items-center mb-3`}
          >
            <Text style={tw`text-white text-callout font-bold`}>Share with circle</Text>
          </PressableScale>
          <PressableScale onPress={close} style={tw`py-3 items-center`}>
            <Text style={tw`text-ink-2 font-semibold`}>Keep private</Text>
          </PressableScale>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
