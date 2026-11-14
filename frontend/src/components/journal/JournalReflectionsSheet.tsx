import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
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
          <View style={tw`px-gutter-wide pb-3 flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-callout font-bold text-ink`}>Reflections</Text>
              <Text style={tw`text-sm text-ink-3 mt-0.5`}>
                People who sat with a line you shared
              </Text>
            </View>
            <PressableScale
              onPress={close}
              pressedScale={0.9}
              hitSlop={8}
              accessibilityLabel="Close"
              style={tw`w-10 h-10 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={20} color={theme.colors.ink2} />
            </PressableScale>
          </View>

          <ScrollView style={tw`px-gutter-wide`} contentContainerStyle={tw`pb-6`}>
            {loading ? (
              <SkeletonList variant="comment" count={3} />
            ) : reflections.length === 0 ? (
              <View style={tw`py-8 px-2`}>
                <Text style={tw`text-ink-2 text-body leading-6 text-center mb-4`}>
                  Nothing yet. When you share a page publicly, friends can reply to a sentence —
                  those notes land here.
                </Text>
                <PressableScale
                  onPress={() => {
                    feedback.transition();
                    close();
                    setTimeout(onOpenVoices, 200);
                  }}
                  style={tw`py-3.5 rounded-card bg-emerald-600 items-center`}
                >
                  <Text style={tw`text-white font-bold`}>Listen to Voices</Text>
                </PressableScale>
              </View>
            ) : (
              reflections.map((r) => {
                return (
                  <View
                    key={r.id}
                    style={tw`mb-3 bg-card border border-line rounded-card p-4`}
                  >
                    <View style={tw`flex-row items-center mb-2.5`}>
                      <GrowAvatar
                        userId={r.user_id}
                        username={r.username || 'Friend'}
                        uri={r.avatar}
                        size={36}
                        style={tw`mr-2.5`}
                      />
                      <View style={tw`flex-1`}>
                        <Text style={tw`font-semibold text-ink`} numberOfLines={1}>
                          {r.username || 'Friend'}
                        </Text>
                        {r.quote_text ? (
                          <Text style={tw`text-xs text-emerald-800 italic mt-0.5`} numberOfLines={1}>
                            “{r.quote_text}”
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Text style={tw`text-body text-ink leading-5`}>{r.body}</Text>
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
