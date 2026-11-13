import React from 'react';
import { Text, View } from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { MessageReactionEmoji, MessageReactions } from '../../services/api/messages';
import { feedback } from '../../utils/interactionFeedback';

export function applyReactionLocal(
  current: MessageReactions | undefined,
  emoji: MessageReactionEmoji
): MessageReactions {
  const counts = { ...(current?.counts || {}) };
  const mine = current?.mine ?? null;
  if (mine === emoji) {
    const next = Math.max(0, (counts[emoji] || 1) - 1);
    if (next === 0) delete counts[emoji];
    else counts[emoji] = next;
    return { counts, mine: null };
  }
  if (mine) {
    const next = Math.max(0, (counts[mine] || 1) - 1);
    if (next === 0) delete counts[mine];
    else counts[mine] = next;
  }
  counts[emoji] = (counts[emoji] || 0) + 1;
  return { counts, mine: emoji };
}

export const REACTION_GLYPH: Record<MessageReactionEmoji, string> = {
  love: '❤️',
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  seed: '🌱',
  clap: '🙌',
};

export const REACTION_ORDER: MessageReactionEmoji[] = [
  'love',
  'fire',
  'laugh',
  'wow',
  'seed',
  'clap',
];

type PickerProps = {
  mine: MessageReactionEmoji | null;
  dark?: boolean;
  onPick: (emoji: MessageReactionEmoji) => void;
};

// Colours follow the chat wall (`dark` = a dark wall, incl. Linen in dark mode), not
// the app scheme: light walls stay light in both schemes, so these stay literal.
export function ReactionPicker({ mine, dark, onPick }: PickerProps) {
  return (
    <View
      style={[
        tw`flex-row items-center px-1.5 py-1 rounded-full mb-1.5`,
        {
          backgroundColor: dark ? '#3A3632' : '#FFFcf7',
          borderWidth: 1,
          borderColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
        },
      ]}
    >
      {REACTION_ORDER.map((key) => {
        const active = mine === key;
        return (
          <PressableScale
            key={key}
            pressedScale={0.88}
            onPress={() => {
              feedback.like(mine !== key);
              onPick(key);
            }}
            style={[
              tw`w-9 h-9 items-center justify-center rounded-full`,
              active ? { backgroundColor: dark ? 'rgba(5,150,105,0.35)' : '#ECFDF5' } : null,
            ]}
            accessibilityLabel={`React ${key}`}
          >
            <Text style={{ fontSize: 18 }}>{REACTION_GLYPH[key]}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

type ChipsProps = {
  reactions?: MessageReactions | null;
  own?: boolean;
  dark?: boolean;
  onPressChip: (emoji: MessageReactionEmoji) => void;
};

export function ReactionChips({ reactions, own, dark, onPressChip }: ChipsProps) {
  const counts = reactions?.counts || {};
  const keys = REACTION_ORDER.filter((k) => (counts[k] || 0) > 0);
  if (keys.length === 0) return null;
  return (
    <View style={tw`flex-row flex-wrap mt-1 ${own ? 'justify-end' : 'justify-start'}`}>
      {keys.map((key) => {
        const mine = reactions?.mine === key;
        return (
          <PressableScale
            key={key}
            onPress={() => {
              feedback.like(!mine);
              onPressChip(key);
            }}
            style={[
              tw`flex-row items-center px-2 py-0.5 rounded-full mr-1 mb-0.5`,
              {
                backgroundColor: mine
                  ? dark
                    ? 'rgba(5,150,105,0.4)'
                    : '#D1FAE5'
                  : dark
                    ? 'rgba(255,255,255,0.08)'
                    : '#EAE4D6',
              },
            ]}
          >
            <Text style={{ fontSize: 12 }}>{REACTION_GLYPH[key]}</Text>
            {(counts[key] || 0) > 1 ? (
              <Text
                style={[
                  tw`text-caption font-bold`,
                  { marginLeft: 3, color: dark ? '#FFFcf7' : '#44403C' },
                ]}
              >
                {counts[key]}
              </Text>
            ) : null}
          </PressableScale>
        );
      })}
    </View>
  );
}
