import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import PressableScale from '../ui/PressableScale';
import { StarRow } from './StarRating';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import {
  formatOfferLine,
  listInstructors,
  type DiscoverInstructor,
} from '../../services/api/instructor';
import GrowAvatar from '../ui/GrowAvatar';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { horizontalScrollProps } from '../../constants/scroll';
import { feedback } from '../../utils/interactionFeedback';
import { SkeletonList } from '../ui/SkeletonCard';
import type { ProfilePreview } from '../../app/navigation/RootNavigator';

type Props = {
  category?: string | null;
  forPaths?: boolean;
  title?: string;
  onOpenProfile: (userId: string, preview?: ProfilePreview) => void;
  onMessage?: (person: DiscoverInstructor) => void;
  onSeeAll?: () => void;
};

/** Horizontal “Instructors on your paths” discovery row. */
export default function InstructorDiscoveryStrip({
  category,
  forPaths = true,
  title = 'Instructors on your paths',
  onOpenProfile,
  onMessage,
  onSeeAll,
}: Props) {
  const [items, setItems] = useState<DiscoverInstructor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listInstructors({
      limit: 12,
      forPaths: forPaths && !category,
      category: category || undefined,
    })
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, forPaths]);

  if (!loading && items.length === 0) return null;

  return (
    <View style={tw`mb-4`}>
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
          {title}
        </Text>
        {onSeeAll ? (
          <PressableScale onPress={onSeeAll} hitSlop={8}>
            <Text style={tw`text-xs font-bold text-emerald-700`}>See all</Text>
          </PressableScale>
        ) : null}
      </View>
      {loading ? (
        <SkeletonList variant="inbox" count={2} />
      ) : (
        <ScrollView
          horizontal
          {...horizontalScrollProps}
          contentContainerStyle={tw`gap-2.5 pr-2`}
        >
          {items.map((person) => {
            const pathLabel =
              (person.shared_categories[0] && getCategoryLabel(person.shared_categories[0])) ||
              (person.categories[0] && getCategoryLabel(person.categories[0])) ||
              'Coach';
            return (
              <Pressable
                key={person.id}
                onPress={() => {
                  feedback.open();
                  onOpenProfile(person.id, { username: person.username, avatarUrl: person.avatar });
                }}
                style={tw`w-[168px] bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3`}
              >
                <View style={tw`flex-row items-center mb-2`}>
                  <GrowAvatar
                    userId={person.id}
                    username={person.username}
                    uri={person.avatar}
                    size={44}
                    style={tw`mr-2.5`}
                  />
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-bold text-stone-900 text-sm`} numberOfLines={1}>
                      {person.username}
                    </Text>
                    <View style={tw`flex-row items-center mt-0.5`}>
                      <Ionicons name="school" size={11} color="#059669" />
                      <Text style={tw`text-[11px] text-emerald-700 font-semibold ml-0.5`}>
                        Instructor
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={tw`text-xs text-stone-500 mb-1.5`} numberOfLines={2}>
                  {person.teaching_headline || `Teaching ${pathLabel}`}
                </Text>
                {person.rating_count && person.rating_avg ? (
                  <View style={tw`flex-row items-center mb-1`}>
                    <StarRow value={person.rating_avg} size={11} />
                    <Text style={tw`text-[11px] text-stone-500 ml-1`}>{person.rating_avg}</Text>
                  </View>
                ) : null}
                {formatOfferLine(person) ? (
                  <Text style={tw`text-[11px] text-emerald-800 font-semibold mb-1.5`} numberOfLines={1}>
                    {formatOfferLine(person)}
                  </Text>
                ) : (
                  <Text style={tw`text-[11px] text-stone-500 mb-1.5`}>{pathLabel}</Text>
                )}
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-[11px] text-stone-500`}>
                    {person.vote_count} endorse{person.vote_count === 1 ? '' : 's'}
                  </Text>
                  {onMessage ? (
                    <Pressable
                      onPress={() => {
                        feedback.send();
                        onMessage(person);
                      }}
                      hitSlop={8}
                    >
                      <Text style={tw`text-xs font-bold text-emerald-700`}>Reach out</Text>
                    </Pressable>
                  ) : (
                    <Text style={tw`text-xs font-bold text-emerald-700`}>View</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
