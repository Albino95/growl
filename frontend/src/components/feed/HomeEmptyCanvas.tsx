import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import FadeInUp from '../ui/FadeInUp';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { listFriends, type FriendSummary } from '../../services/api/friends';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { horizontalScrollProps } from '../../constants/scroll';

type Props = {
  filtered: boolean;
  categoryLabel?: string;
  failed: boolean;
  hasPaths: boolean;
  onExplore: () => void;
  onJournal: () => void;
  onClearFilter?: () => void;
  onChoosePaths: () => void;
  onOpenProfile: (userId: string) => void;
  onInstructors: () => void;
};

/**
 * First-session Home — never a blank Instagram empty.
 * Path people, today's journal, and a way to meet instructors.
 */
export default function HomeEmptyCanvas({
  filtered,
  categoryLabel,
  failed,
  hasPaths,
  onExplore,
  onJournal,
  onClearFilter,
  onChoosePaths,
  onOpenProfile,
  onInstructors,
}: Props) {
  const [people, setPeople] = useState<FriendSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listFriends()
      .then((list) => {
        if (!cancelled) setPeople(list.slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (filtered) {
    return (
      <FadeInUp style={tw`px-5 pt-6 pb-4`}>
        <View style={tw`rounded-2xl bg-[#FFFcf7] border border-stone-200/80 px-5 py-6`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            Path home
          </Text>
          <Text style={tw`text-lg font-bold text-stone-900 mt-1`}>
            Quiet on {categoryLabel || 'this path'}
          </Text>
          <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
            Posts from other paths stay under All. Write a note, or clear the filter.
          </Text>
          <View style={tw`flex-row gap-2 mt-4`}>
            <PressableScale
              onPress={onJournal}
              style={tw`flex-1 py-2.5 rounded-xl bg-emerald-600 items-center`}
            >
              <Text style={tw`text-white font-bold text-sm`}>Today’s note</Text>
            </PressableScale>
            {onClearFilter ? (
              <PressableScale
                onPress={onClearFilter}
                style={tw`px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white/80 items-center`}
              >
                <Text style={tw`text-stone-700 font-semibold text-sm`}>All</Text>
              </PressableScale>
            ) : null}
          </View>
        </View>
      </FadeInUp>
    );
  }

  if (failed) {
    return (
      <FadeInUp style={tw`px-5 pt-6 pb-4`}>
        <View style={tw`rounded-2xl bg-[#FFFcf7] border border-red-200 px-5 py-6`}>
          <Text style={tw`text-lg font-bold text-stone-900`}>Couldn’t grow the feed</Text>
          <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
            Pull down to try again. Your journal still works offline-first on this device.
          </Text>
          <PressableScale
            onPress={onJournal}
            style={tw`mt-4 py-2.5 rounded-xl bg-emerald-600 items-center`}
          >
            <Text style={tw`text-white font-bold text-sm`}>Write today’s note</Text>
          </PressableScale>
        </View>
      </FadeInUp>
    );
  }

  return (
    <FadeInUp style={tw`px-5 pt-4 pb-6`}>
      <View style={tw`rounded-2xl bg-[#FFFcf7] border border-stone-200/80 px-5 py-5`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
          Start growing
        </Text>
        <Text style={tw`text-[20px] font-bold text-stone-900 mt-1`}>Your garden is new</Text>
        <Text style={tw`text-sm text-stone-500 mt-1.5 leading-5`}>
          Home fills with people on your paths. Until then, a private note is the first seed.
        </Text>

        <PressableScale
          onPress={onJournal}
          style={tw`mt-4 py-3 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2`}
        >
          <Ionicons name="book-outline" size={16} color="#FFFFFF" />
          <Text style={tw`text-white font-bold text-[15px]`}>Write today’s journal</Text>
        </PressableScale>

        {!hasPaths ? (
          <PressableScale
            onPress={onChoosePaths}
            style={tw`mt-2 py-3 rounded-2xl border border-stone-200 bg-white/80 items-center`}
          >
            <Text style={tw`text-stone-800 font-semibold text-sm`}>Pick your growth paths</Text>
          </PressableScale>
        ) : null}
      </View>

      {hasPaths ? (
        <View style={tw`mt-4 min-h-[96px]`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
            People on your paths
          </Text>
          {!loaded ? (
            <View style={tw`flex-row`}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={tw`w-[92px] mr-2.5 items-center`}>
                  <View style={tw`w-14 h-14 rounded-full bg-[#EAE4D6]`} />
                  <View style={tw`w-14 h-2.5 rounded-full bg-[#EAE4D6] mt-2`} />
                </View>
              ))}
            </View>
          ) : people.length > 0 ? (
            <ScrollView horizontal {...horizontalScrollProps}>
              {people.map((person) => (
                <PressableScale
                  key={person.id}
                  onPress={() => onOpenProfile(person.id)}
                  style={tw`w-[92px] mr-2.5 items-center`}
                >
                  <GrowAvatar
                    userId={person.id}
                    username={person.username}
                    uri={person.avatar}
                    size={56}
                  />
                  <Text numberOfLines={1} style={tw`text-xs font-semibold text-stone-800 mt-1.5`}>
                    {person.username}
                  </Text>
                  <Text numberOfLines={1} style={tw`text-[10px] text-stone-500 mt-0.5`}>
                    {person.categories?.[0]
                      ? getCategoryLabel(person.categories[0])
                      : person.is_instructor
                        ? 'Instructor'
                        : 'Growing'}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          ) : (
            <Text style={tw`text-sm text-stone-500 leading-5`}>
              No one on your paths yet. Explore is where you meet them.
            </Text>
          )}
        </View>
      ) : null}

      <View style={tw`flex-row gap-2 mt-4`}>
        <PressableScale
          onPress={onExplore}
          style={tw`flex-1 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80 items-center`}
        >
          <Text style={tw`text-stone-800 font-semibold text-sm`}>Explore people</Text>
        </PressableScale>
        <PressableScale
          onPress={onInstructors}
          style={tw`flex-1 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/80 items-center`}
        >
          <Text style={tw`text-stone-800 font-semibold text-sm`}>Find instructors</Text>
        </PressableScale>
      </View>
    </FadeInUp>
  );
}
