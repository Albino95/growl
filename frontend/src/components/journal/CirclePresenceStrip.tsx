import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import { horizontalScrollProps } from '../../constants/scroll';
import { resolveAvatarUri } from '../../utils/images';
import { feedback } from '../../utils/interactionFeedback';
import type { CircleJournalEntry } from '../../services/api/journal';

type VoicePerson = {
  userId: string;
  username: string;
  avatar?: string | null;
  count: number;
  isFresh: boolean;
};

type Props = {
  entries: CircleJournalEntry[];
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
};

function isFresh(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 36 * 60 * 60 * 1000;
}

/** Stories-like strip of friends with public journals — filter Voices by person. */
export default function CirclePresenceStrip({ entries, selectedUserId, onSelect }: Props) {
  const people = useMemo(() => {
    const map = new Map<string, VoicePerson>();
    for (const e of entries) {
      const prev = map.get(e.user_id);
      if (prev) {
        prev.count += 1;
        if (isFresh(e.created_at)) prev.isFresh = true;
      } else {
        map.set(e.user_id, {
          userId: e.user_id,
          username: e.username || 'Friend',
          avatar: e.avatar,
          count: 1,
          isFresh: isFresh(e.created_at),
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.isFresh !== b.isFresh) return a.isFresh ? -1 : 1;
      return b.count - a.count;
    });
  }, [entries]);

  if (people.length === 0) return null;

  return (
    <View style={tw`mb-3`}>
      <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2.5`}>
        In the circle
      </Text>
      <ScrollView
        horizontal
        {...horizontalScrollProps}
        contentContainerStyle={tw`gap-3 pr-2`}
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          onPress={() => {
            feedback.select();
            onSelect(null);
          }}
          style={tw`items-center w-[64px]`}
        >
          <View
            style={tw`w-14 h-14 rounded-full items-center justify-center border-2 ${
              selectedUserId == null
                ? 'bg-emerald-600 border-emerald-600'
                : 'bg-[#EAE4D6] border-transparent'
            }`}
          >
            <Text
              style={tw`text-xs font-bold ${
                selectedUserId == null ? 'text-white' : 'text-stone-600'
              }`}
            >
              All
            </Text>
          </View>
          <Text style={tw`text-[11px] text-stone-500 mt-1.5`} numberOfLines={1}>
            Everyone
          </Text>
        </Pressable>

        {people.map((p) => {
          const selected = selectedUserId === p.userId;
          const uri = resolveAvatarUri(p.userId, p.username, p.avatar);
          return (
            <Pressable
              key={p.userId}
              onPress={() => {
                feedback.select();
                onSelect(selected ? null : p.userId);
              }}
              style={tw`items-center w-[64px]`}
            >
              <View
                style={[
                  tw`w-14 h-14 rounded-full p-[2px]`,
                  {
                    borderWidth: 2,
                    borderColor: selected
                      ? '#059669'
                      : p.isFresh
                        ? '#F97066'
                        : 'rgba(28,25,23,0.08)',
                  },
                ]}
              >
                <Image source={{ uri }} style={tw`w-full h-full rounded-full`} />
              </View>
              <Text
                style={tw`text-[11px] mt-1.5 ${
                  selected ? 'text-emerald-800 font-semibold' : 'text-stone-500'
                }`}
                numberOfLines={1}
              >
                {p.username.split(' ')[0]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
