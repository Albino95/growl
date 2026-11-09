import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

type Props = {
  sunday: boolean;
  onWrite: () => void;
  onDismiss?: () => void;
};

/** In-app journal cue — Sunday sit, or a quiet daily note. Not a store review. */
export default function HomeSitCue({ sunday, onWrite, onDismiss }: Props) {
  return (
    <View
      style={tw`${
        sunday
          ? 'mx-4 mt-2 px-3.5 py-3 rounded-2xl bg-[#FFF1F0] border border-[#FECACA]/80'
          : 'mx-4 mt-2 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border border-emerald-200/80'
      }`}
    >
      <View style={tw`flex-row items-start gap-2.5`}>
        <Ionicons
          name={sunday ? 'sunny-outline' : 'book-outline'}
          size={18}
          color={sunday ? '#E11D48' : '#059669'}
          style={tw`mt-0.5`}
        />
        <View style={tw`flex-1`}>
          <Text
            style={tw`text-[11px] font-semibold tracking-widest uppercase ${
              sunday ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {sunday ? 'Sunday sit' : 'Today’s note'}
          </Text>
          <Text style={tw`text-[15px] font-bold text-stone-900 mt-0.5`}>
            {sunday ? 'A quiet page for the week' : 'Write one line before you scroll'}
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1 leading-5`}>
            {sunday
              ? 'Private. Yours. The feed can wait.'
              : 'A private journal is how Grow! starts — posts come after.'}
          </Text>
        </View>
        {onDismiss ? (
          <PressableScale onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
            <Ionicons name="close" size={16} color="#A8A29E" />
          </PressableScale>
        ) : null}
      </View>
      <PressableScale
        onPress={onWrite}
        style={tw`mt-3 py-2.5 rounded-xl items-center ${sunday ? 'bg-[#F97066]' : 'bg-emerald-600'}`}
      >
        <Text style={tw`text-white font-bold text-sm`}>
          {sunday ? 'Open Sunday journal' : 'Write today’s journal'}
        </Text>
      </PressableScale>
    </View>
  );
}
