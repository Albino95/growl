import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { useThemeColors } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import { iconSize } from '../../theme/icons';
import { explainerCopy } from './insightsMath';

type Props = { visible: boolean; days: number; onClose: () => void };

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'happy-outline', text: 'We look at your daily check-ins: mood, path, intention and rest days, plus the days you post or journal.' },
  { icon: 'analytics-outline', text: 'A pattern only shows when there’s enough to go on. “Early” means a hint; “clear” means it’s held up for a while.' },
  { icon: 'lock-closed-outline', text: 'Only you can see these. Nothing here is shared or used for anything else.' },
  { icon: 'eye-off-outline', text: 'Not useful? Tap ••• and hide it. Hidden patterns stay hidden on this phone.' },
  { icon: 'heart-outline', text: 'These aren’t advice or a diagnosis. If you’re finding things hard, talking to someone you trust can help.' },
];

export default function InsightsExplainerSheet({ visible, days, onClose }: Props) {
  const c = useThemeColors();
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose}>
      {({ close }) => (
        <View style={tw`px-gutter pb-2`}>
          <Text style={tw`text-title font-bold text-ink`} accessibilityRole="header">
            How this works
          </Text>
          <Text style={tw`text-body text-ink-2 mt-1 mb-4`}>{explainerCopy(days)}</Text>
          {POINTS.map((p) => (
            <View key={p.icon} style={tw`flex-row mb-3`}>
              <Ionicons name={p.icon} size={iconSize.sm} color={c.leafInk} style={tw`mr-3 mt-0.5`} />
              <Text style={tw`flex-1 text-callout text-ink-2`}>{p.text}</Text>
            </View>
          ))}
          <PressableScale
            onPress={close}
            feedback="tap"
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={tw`mt-2 py-3 rounded-control items-center bg-emerald-600`}
          >
            <Text style={tw`text-white font-bold`}>Got it</Text>
          </PressableScale>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
