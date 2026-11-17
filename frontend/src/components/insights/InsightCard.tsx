import React from 'react';
import { View, Text, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { iconSize } from '../../theme/icons';
import type { Insight } from '../../services/api/insights';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  mood_by_path: 'leaf-outline',
  mood_by_weekday: 'calendar-outline',
  mood_trend: 'trending-up-outline',
  mood_by_activity: 'create-outline',
  rest_bounce: 'moon-outline',
  intention_follow_through: 'checkmark-circle-outline',
  consistency: 'repeat-outline',
};

type Props = {
  insight: Insight;
  onHide: (id: string) => void;
  onExplain: () => void;
};

export default function InsightCard({ insight, onHide, onExplain }: Props) {
  const c = useThemeColors();
  const trendDown = insight.kind === 'mood_trend' && insight.data?.direction === 'down';
  const icon = trendDown ? 'cloud-outline' : (ICONS[insight.kind] ?? 'sparkles-outline');
  const clear = insight.strength === 'clear';

  const onMore = () =>
    Alert.alert('This pattern', undefined, [
      { text: 'Hide this', onPress: () => onHide(insight.id) },
      { text: 'How this works', onPress: onExplain },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View
      style={tw`flex-row bg-raised/60 rounded-control px-3 py-3 mb-2`}
      accessible
      accessibilityLabel={`${clear ? 'Clear pattern' : 'Early pattern'}. ${insight.title}. ${insight.body}`}
      accessibilityActions={[
        { name: 'hide', label: 'Hide this' },
        { name: 'explain', label: 'How this works' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'hide') onHide(insight.id);
        else if (e.nativeEvent.actionName === 'explain') onExplain();
      }}
    >
      <View style={[tw`w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5`, { backgroundColor: c.card }]}>
        <Ionicons name={icon} size={iconSize.sm} color={c.leafInk} />
      </View>
      <View style={tw`flex-1`}>
        <Text style={tw`text-caption font-semibold text-ink-3 uppercase tracking-wider`}>
          {clear ? 'Clear pattern' : 'Early pattern'}
        </Text>
        <Text style={tw`text-callout font-semibold text-ink mt-0.5`}>{insight.title}</Text>
        <Text style={tw`text-footnote text-ink-2 mt-1`}>{insight.body}</Text>
      </View>
      <PressableScale
        onPress={onMore}
        feedback="selection"
        accessibilityRole="button"
        accessibilityLabel="More options for this pattern"
        hitSlop={10}
        style={tw`p-1 -mr-1 -mt-1 self-start`}
      >
        <Ionicons name="ellipsis-horizontal" size={iconSize.sm} color={c.ink3} />
      </PressableScale>
    </View>
  );
}
