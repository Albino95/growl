import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';

export type SuggestedChip = { key: string; label: string };

type Props = {
  recents: string[];
  suggestions: SuggestedChip[];
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClearAll: () => void;
};

export function SuggestedChips({
  suggestions,
  onPick,
  title = 'Suggested',
}: {
  suggestions: SuggestedChip[];
  onPick: (query: string) => void;
  title?: string;
}) {
  if (!suggestions.length) return null;
  return (
    <View style={tw`mb-4`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>{title}</Text>
      <View style={tw`flex-row flex-wrap`}>
        {suggestions.map((s) => (
          <PressableScale
            key={s.key}
            onPress={() => {
              haptic('selection');
              onPick(s.label);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Search ${s.label}`}
            style={tw`mr-2 mb-2 px-3 py-1.5 rounded-chip border border-line bg-card`}
          >
            <Text style={tw`text-footnote font-semibold text-ink-2`}>{s.label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

/** Shown while the search box is focused and empty: recent searches + suggested paths. */
export default function RecentSearches({ recents, suggestions, onPick, onRemove, onClearAll }: Props) {
  return (
    <View>
      {recents.length > 0 ? (
        <View style={tw`mb-4`}>
          <View style={tw`flex-row items-center justify-between mb-1`}>
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>Recent</Text>
            <PressableScale
              onPress={() => {
                haptic('tapLight');
                onClearAll();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear all recent searches"
            >
              <Text style={tw`text-footnote font-semibold text-emerald-700`}>Clear all</Text>
            </PressableScale>
          </View>
          {recents.map((q) => (
            <View key={q} style={tw`flex-row items-center py-2.5 border-b border-line/60`}>
              <PressableScale
                onPress={() => onPick(q)}
                style={tw`flex-row items-center flex-1`}
                accessibilityRole="button"
                accessibilityLabel={`Search ${q} again`}
              >
                <Ionicons name="time-outline" size={18} color={theme.colors.iconMuted} />
                <Text style={tw`ml-3 text-body text-ink flex-1`} numberOfLines={1}>
                  {q}
                </Text>
              </PressableScale>
              <PressableScale
                onPress={() => onRemove(q)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${q} from recent searches`}
                style={tw`pl-3`}
              >
                <Ionicons name="close" size={18} color={theme.colors.iconMuted} />
              </PressableScale>
            </View>
          ))}
        </View>
      ) : (
        <Text style={tw`text-footnote text-ink-3 mb-4`}>
          Find people by name, posts by what they say, or a #tag.
        </Text>
      )}
      <SuggestedChips suggestions={suggestions} onPick={onPick} />
    </View>
  );
}
