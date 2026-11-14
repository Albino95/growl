import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { useColorSchemeName, useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { iconSize } from '../../theme/icons';
import { alertMessage } from '../../utils/confirmDialog';
import GrowAvatar from '../ui/GrowAvatar';
import { MOOD_META, growthPathFromTags, moodWash } from './journalMeta';
import type { CircleJournalEntry, JournalMood } from '../../services/api/journal';
import { feelJournalEntry, muteJournalAuthor } from '../../services/api/journal';
import { feedback } from '../../utils/interactionFeedback';
import CATEGORIES from '../../data/categories';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  entry: CircleJournalEntry;
  onOpenProfile: (userId: string) => void;
  onMessage: (entry: CircleJournalEntry) => void;
  onReplyToLine?: (entry: CircleJournalEntry) => void;
  onShare?: (entry: CircleJournalEntry) => void;
  onMuted?: (userId: string) => void;
};

function pathLabel(key: string | null): string | null {
  if (!key) return null;
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export default function CircleJournalCard({
  entry,
  onOpenProfile,
  onMessage,
  onReplyToLine,
  onShare,
  onMuted,
}: Props) {
  const [felt, setFelt] = useState(!!entry.feltThis);
  const c = useThemeColors();
  const scheme = useColorSchemeName();
  const [feeling, setFeeling] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const prevFelt = useRef(felt);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: the filled heart is the feedback; no pop.
    if (felt && !prevFelt.current && !reduceMotion) {
      Animated.sequence([
        Animated.spring(heartScale, {
          toValue: 1.35,
          friction: 3,
          tension: 240,
          useNativeDriver: true,
        }),
        Animated.spring(heartScale, {
          toValue: 1,
          friction: 5,
          tension: 160,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevFelt.current = felt;
  }, [felt, heartScale, reduceMotion]);

  const mood = (entry.mood as JournalMood | null) || null;
  const meta = mood ? MOOD_META[mood] : null;
  const path = growthPathFromTags(entry.tags || []);
  const excerpt =
    entry.content.length > 180 ? `${entry.content.slice(0, 177).trim()}…` : entry.content;

  const onFelt = async () => {
    if (felt || feeling) return;
    setFeeling(true);
    feedback.like(true);
    try {
      await feelJournalEntry(entry.id);
      setFelt(true);
    } catch (e) {
      void alertMessage('Could not react', e instanceof Error ? e.message : 'Try again');
    } finally {
      setFeeling(false);
    }
  };

  const onMore = () => {
    const options: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];
    if (onShare) {
      options.push({
        text: 'Share voice card',
        onPress: () => {
          feedback.open();
          onShare(entry);
        },
      });
    }
    options.push(
      { text: 'View profile', onPress: () => onOpenProfile(entry.user_id) },
      {
        text: 'Mute journals',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await muteJournalAuthor(entry.user_id, true);
              onMuted?.(entry.user_id);
            } catch (e) {
              void alertMessage('Error', e instanceof Error ? e.message : 'Could not mute');
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' }
    );
    Alert.alert(entry.username, undefined, options);
  };

  return (
    <View
      style={[
        tw`mb-3 px-4 pt-4 pb-3 rounded-card`,
        {
          backgroundColor: mood && meta ? moodWash(mood, scheme) : c.card,
          borderWidth: 1,
          borderColor: scheme === 'dark' ? c.line : 'rgba(28,25,23,0.06)',
        },
      ]}
    >
      <View style={tw`flex-row items-center mb-3`}>
        <PressableScale
          pressedScale={0.98}
          onPress={() => onOpenProfile(entry.user_id)}
          style={tw`flex-row items-center flex-1`}
        >
          <GrowAvatar
            userId={entry.user_id}
            username={entry.username}
            uri={entry.avatar}
            size={40}
            style={tw`mr-3`}
          />
          <View style={tw`flex-1`}>
            <Text style={tw`font-bold text-ink`} numberOfLines={1}>
              {entry.username}
            </Text>
            <Text style={tw`text-xs text-ink-3 mt-0.5`}>
              {new Date(entry.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {meta ? ` · ${meta.label}` : ''}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          onPress={onMore}
          pressedScale={0.9}
          hitSlop={10}
          accessibilityLabel="More options"
          style={tw`p-1`}
        >
          <Ionicons name="ellipsis-horizontal" size={iconSize.sm} color={c.ink3} />
        </PressableScale>
      </View>

      <Text style={tw`text-ink text-callout font-normal`}>{excerpt}</Text>

      {path ? (
        <View style={tw`mt-3 self-start px-2.5 py-1 rounded-full bg-stone-900/5`}>
          <Text style={tw`text-caption font-semibold text-ink-2`}>{pathLabel(path)}</Text>
        </View>
      ) : null}

      <View style={tw`flex-row gap-2 mt-4`}>
        <PressableScale
          onPress={() => void onFelt()}
          disabled={felt || feeling}
          style={tw`flex-1 py-2.5 rounded-control items-center flex-row justify-center gap-1.5 border ${
            felt ? 'bg-energy-50 border-red-200' : 'bg-card/70 border-line'
          }`}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={felt ? 'heart' : 'heart-outline'}
              size={iconSize.xs}
              color={felt ? tw.color('rose-600') : c.ink2}
            />
          </Animated.View>
          <Text style={tw`text-xs font-bold ${felt ? 'text-rose-600' : 'text-ink-2'}`}>
            {felt ? 'You felt this' : 'Felt this'}
          </Text>
        </PressableScale>
        <PressableScale
          onPress={() => {
            feedback.open();
            onReplyToLine?.(entry);
          }}
          style={tw`flex-1 py-2.5 rounded-control items-center flex-row justify-center gap-1.5 bg-card border border-line`}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={iconSize.xs} color={c.ink} />
          <Text style={tw`text-xs font-bold text-ink`}>Reply</Text>
        </PressableScale>
        {onShare ? (
          <PressableScale
            onPress={() => {
              feedback.open();
              onShare(entry);
            }}
            style={tw`w-11 py-2.5 rounded-control items-center justify-center bg-card border border-line`}
            accessibilityLabel="Share voice"
          >
            <Ionicons name="share-outline" size={16} color={c.brand} />
          </PressableScale>
        ) : null}
      </View>
      {entry.allowMessages !== false ? (
        <PressableScale
          onPress={() => {
            feedback.send();
            onMessage(entry);
          }}
          style={tw`mt-2 py-2.5 rounded-control items-center bg-emerald-600`}
        >
          <Text style={tw`text-xs font-bold text-white`}>Message about this</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
