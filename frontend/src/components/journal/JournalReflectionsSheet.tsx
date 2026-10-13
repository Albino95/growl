import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import { resolveAvatarUri } from '../../utils/images';
import type { JournalReflection } from '../../services/api/journal';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import { SkeletonList } from '../ui/SkeletonCard';
import { feedback } from '../../utils/interactionFeedback';

type Props = {
  visible: boolean;
  loading: boolean;
  reflections: JournalReflection[];
  onClose: () => void;
  onOpenVoices: () => void;
};

/** Replies friends left on your shared journal pages. */
export default function JournalReflectionsSheet({
  visible,
  loading,
  reflections,
  onClose,
  onOpenVoices,
}: Props) {
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.82}>
      {({ close }) => (
        <>
          <View style={tw`px-5 pb-3 flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>Reflections</Text>
              <Text style={tw`text-sm text-stone-500 mt-0.5`}>
                People who sat with a line you shared
              </Text>
            </View>
            <Pressable
              onPress={close}
              style={tw`w-10 h-10 rounded-full bg-[#EAE4D6] items-center justify-center`}
            >
              <Ionicons name="close" size={20} color="#44403C" />
            </Pressable>
          </View>

          <ScrollView style={tw`px-5`} contentContainerStyle={tw`pb-6`}>
            {loading ? (
              <SkeletonList variant="comment" count={3} />
            ) : reflections.length === 0 ? (
              <View style={tw`py-8 px-2`}>
                <Text style={tw`text-stone-700 text-[15px] leading-6 text-center mb-4`}>
                  Nothing yet. When you share a page publicly, friends can reply to a sentence —
                  those notes land here.
                </Text>
                <Pressable
                  onPress={() => {
                    feedback.transition();
                    close();
                    setTimeout(onOpenVoices, 200);
                  }}
                  style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center`}
                >
                  <Text style={tw`text-white font-bold`}>Listen to Voices</Text>
                </Pressable>
              </View>
            ) : (
              reflections.map((r) => {
                const av = resolveAvatarUri(r.user_id, r.username || 'Friend', r.avatar);
                return (
                  <View
                    key={r.id}
                    style={tw`mb-3 bg-white border border-stone-200 rounded-2xl px-3.5 py-3.5`}
                  >
                    <View style={tw`flex-row items-center mb-2.5`}>
                      <Image source={{ uri: av }} style={tw`w-9 h-9 rounded-full mr-2.5`} />
                      <View style={tw`flex-1`}>
                        <Text style={tw`font-semibold text-stone-900`} numberOfLines={1}>
                          {r.username || 'Friend'}
                        </Text>
                        {r.quote_text ? (
                          <Text style={tw`text-xs text-emerald-800 italic mt-0.5`} numberOfLines={1}>
                            “{r.quote_text}”
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={tw`text-[15px] text-stone-800 leading-5`}>{r.body}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </AnimatedBottomSheet>
  );
}
