import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GrowLoader from '../ui/GrowLoader';
import { feedback } from '../../utils/interactionFeedback';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

type Props = {
  icon: string;
  title: string;
  subtitle: string;
  onCamera: () => void;
  onLibrary: () => void;
  /** Shown instead of the buttons while a pick is being imported. */
  busyLabel?: string | null;
};

/** Empty state: what you're making + Camera / Library. */
export default function MediaSourcePicker({
  icon,
  title,
  subtitle,
  onCamera,
  onLibrary,
  busyLabel,
}: Props) {
  return (
    <View style={tw`flex-1 items-center justify-center px-6`}>
      {busyLabel ? (
        <GrowLoader label={busyLabel} />
      ) : (
        <>
          <View style={tw`items-center mb-10`}>
            <Pressable
              onLongPress={() => feedback.egg()}
              delayLongPress={450}
              style={tw`bg-white/10 rounded-full p-5 mb-4 border border-white/15`}
              accessible={false}
              // Decorative icon (long-press easter egg only): hidden from screen readers.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={44}
                color="#34D399"
              />
            </Pressable>
            <Text style={tw`text-white text-2xl font-bold mb-2 text-center`}>{title}</Text>
            <Text style={tw`text-white/70 text-base text-center px-4 leading-6`}>{subtitle}</Text>
          </View>
          <View style={tw`flex-row gap-3 w-full`}>
            <PressableScale
              onPress={onCamera}
              accessibilityRole="button"
              accessibilityLabel="Camera"
              style={tw`flex-1 flex-row items-center justify-center rounded-card py-4 px-4 bg-brand-600`}
            >
              <Ionicons name="camera" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Camera</Text>
            </PressableScale>
            <PressableScale
              onPress={onLibrary}
              accessibilityRole="button"
              accessibilityLabel="Library"
              style={tw`flex-1 flex-row items-center justify-center rounded-card py-4 px-4 bg-white/15 border border-white/25`}
            >
              <Ionicons name="images" size={22} color="#FFFFFF" style={tw`mr-2`} />
              <Text style={tw`font-semibold text-base text-white`}>Library</Text>
            </PressableScale>
          </View>
        </>
      )}
    </View>
  );
}
