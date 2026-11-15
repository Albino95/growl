import React from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { haptic } from '../../theme/haptics';
import type { MentionSuggestion } from '../../services/api/mentions';

type Props = {
  items: MentionSuggestion[];
  loading: boolean;
  onPick: (user: MentionSuggestion) => void;
  /** 'dark' for the camera composer (white text on black). */
  tone?: 'light' | 'dark';
};

/**
 * @mention picker. Rendered in-flow directly above the input, so it rides the
 * keyboard with the input (no absolute overlay — Android drops touches outside
 * a parent's bounds).
 */
export default function MentionSuggestions({ items, loading, onPick, tone = 'light' }: Props) {
  const dark = tone === 'dark';
  return (
    <View
      style={tw`${dark ? 'bg-[#1C1917] border-white/10' : 'bg-card border-line'} border rounded-card mb-2 overflow-hidden`}
      accessibilityRole="list"
      accessibilityLabel="People to mention"
    >
      {loading && items.length === 0 ? (
        <View style={tw`flex-row items-center px-3 py-3`}>
          <ActivityIndicator size="small" color={dark ? '#FFFFFF' : theme.colors.ink3} />
          <Text style={tw`ml-2 text-footnote ${dark ? 'text-white/70' : 'text-ink-3'}`}>
            Finding people…
          </Text>
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="always"
          style={{ maxHeight: 208 }}
          nestedScrollEnabled
        >
          {items.map((u, i) => (
            <PressableScale
              key={u.id}
              pressedScale={0.98}
              onPress={() => {
                haptic('tapLight');
                onPick(u);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${u.display_name}, @${u.username}`}
              style={tw`flex-row items-center px-3 py-2 ${
                i > 0 ? (dark ? 'border-t border-white/10' : 'border-t border-line/60') : ''
              }`}
            >
              <GrowAvatar userId={u.id} username={u.username} uri={u.avatar_url} size={32} />
              <View style={tw`ml-3 flex-1`}>
                <Text
                  style={tw`text-footnote font-semibold ${dark ? 'text-white' : 'text-ink'}`}
                  numberOfLines={1}
                >
                  {u.display_name}
                </Text>
                <Text style={tw`text-caption ${dark ? 'text-white/60' : 'text-ink-3'}`} numberOfLines={1}>
                  @{u.username}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
