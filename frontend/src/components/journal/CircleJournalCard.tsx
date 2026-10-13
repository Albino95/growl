import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { resolveAvatarUri } from '../../utils/images';
import { MOOD_META, growthPathFromTags } from './journalMeta';
import type { CircleJournalEntry, JournalMood } from '../../services/api/journal';
import { feelJournalEntry, muteJournalAuthor } from '../../services/api/journal';
import { feedback } from '../../utils/interactionFeedback';
import CATEGORIES from '../../data/categories';

type Props = {
  entry: CircleJournalEntry;
  onOpenProfile: (userId: string) => void;
  onMessage: (entry: CircleJournalEntry) => void;
  onReplyToLine?: (entry: CircleJournalEntry) => void;
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
  onMuted,
}: Props) {
  const [felt, setFelt] = useState(!!entry.feltThis);
  const [feeling, setFeeling] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const prevFelt = useRef(felt);

  useEffect(() => {
    if (felt && !prevFelt.current) {
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
  }, [felt, heartScale]);

  const mood = (entry.mood as JournalMood | null) || null;
  const meta = mood ? MOOD_META[mood] : null;
  const path = growthPathFromTags(entry.tags || []);
  const avatar = resolveAvatarUri(entry.user_id, entry.username, entry.avatar);
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
      Alert.alert('Could not react', e instanceof Error ? e.message : 'Try again');
    } finally {
      setFeeling(false);
    }
  };

  const onMore = () => {
    Alert.alert(entry.username, undefined, [
      {
        text: 'Mute journals',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await muteJournalAuthor(entry.user_id, true);
              onMuted?.(entry.user_id);
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not mute');
            }
          })();
        },
      },
      { text: 'View profile', onPress: () => onOpenProfile(entry.user_id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View
      style={[
        tw`mb-3 px-4 pt-4 pb-3 rounded-2xl`,
        {
          backgroundColor: meta?.wash || '#FFFcf7',
          borderWidth: 1,
          borderColor: 'rgba(28,25,23,0.06)',
        },
      ]}
    >
      <View style={tw`flex-row items-center mb-3`}>
        <Pressable
          onPress={() => onOpenProfile(entry.user_id)}
          style={tw`flex-row items-center flex-1`}
        >
          <Image source={{ uri: avatar }} style={tw`w-10 h-10 rounded-full mr-3`} />
          <View style={tw`flex-1`}>
            <Text style={tw`font-bold text-stone-900`} numberOfLines={1}>
              {entry.username}
            </Text>
            <Text style={tw`text-xs text-stone-500 mt-0.5`}>
              {new Date(entry.created_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {meta ? ` · ${meta.label}` : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onMore} hitSlop={10} style={tw`p-1`}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#78716C" />
        </Pressable>
      </View>

      <Text style={tw`text-stone-900 text-[16px] leading-6`}>{excerpt}</Text>

      {path ? (
        <View style={tw`mt-3 self-start px-2.5 py-1 rounded-full bg-stone-900/5`}>
          <Text style={tw`text-[11px] font-semibold text-stone-600`}>{pathLabel(path)}</Text>
        </View>
      ) : null}

      <View style={tw`flex-row gap-2 mt-4`}>
        <Pressable
          onPress={() => void onFelt()}
          disabled={felt || feeling}
          style={tw`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 border ${
            felt ? 'bg-[#FFF1F0] border-[#FECACA]' : 'bg-white/70 border-stone-200'
          }`}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons
              name={felt ? 'heart' : 'heart-outline'}
              size={14}
              color={felt ? '#E11D48' : '#57534E'}
            />
          </Animated.View>
          <Text style={tw`text-xs font-bold ${felt ? 'text-[#E11D48]' : 'text-stone-700'}`}>
            {felt ? 'You felt this' : 'Felt this'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            feedback.open();
            onReplyToLine?.(entry);
          }}
          style={tw`flex-1 py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 bg-white border border-stone-200`}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#1C1917" />
          <Text style={tw`text-xs font-bold text-stone-800`}>Reply to a line</Text>
        </Pressable>
      </View>
      {entry.allowMessages !== false ? (
        <Pressable
          onPress={() => {
            feedback.send();
            onMessage(entry);
          }}
          style={tw`mt-2 py-2.5 rounded-xl items-center bg-emerald-600`}
        >
          <Text style={tw`text-xs font-bold text-white`}>Message about this</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
