import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POST_MUSIC_TRACKS, type PostMusicTrack } from '../../../constants/postMusic';
import tw, { theme } from '../../../lib/tw';
import PressableScale from '../../../components/ui/PressableScale';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Only the id is read, so any stored track shape (e.g. the post draft) fits. */
  selectedTrack: Pick<PostMusicTrack, 'id'> | null;
  onSelectTrack: (track: PostMusicTrack | null) => void;
};

export default function PostMusicSheet({ visible, onClose, selectedTrack, onSelectTrack }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={tw`flex-1 bg-black/50 justify-end`} onPress={onClose}>
        <Pressable
          style={[tw`bg-card rounded-t-sheet px-gutter pt-4`, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <Text style={tw`text-callout font-bold text-ink`}>Add music</Text>
            <PressableScale
              pressedScale={0.9}
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close music"
            >
              <Ionicons name="close" size={24} color={theme.colors.ink3} />
            </PressableScale>
          </View>

          <Text style={tw`text-sm text-ink-3 mb-3`}>
            Optional soundtrack for your post. Listeners can preview it on the feed.
          </Text>

          <ScrollView style={tw`max-h-72`} showsVerticalScrollIndicator={false}>
            <PressableScale
              onPress={() => {
                onSelectTrack(null);
                onClose();
              }}
              style={tw`flex-row items-center py-3 border-b border-line`}
            >
              <Ionicons name="volume-mute-outline" size={22} color={theme.colors.ink3} />
              <Text style={tw`ml-3 text-ink-2 font-medium`}>No music</Text>
              {!selectedTrack && <Ionicons name="checkmark" size={20} color={theme.colors.brand} style={tw`ml-auto`} />}
            </PressableScale>

            {POST_MUSIC_TRACKS.map((track) => {
              const active = selectedTrack?.id === track.id;
              return (
                <PressableScale
                  key={track.id}
                  onPress={() => {
                    onSelectTrack(track);
                    onClose();
                  }}
                  style={tw`flex-row items-center py-3 border-b border-line`}
                >
                  <View style={tw`w-10 h-10 rounded-control bg-brand-50 items-center justify-center`}>
                    <Ionicons name="musical-notes" size={20} color={theme.colors.brand} />
                  </View>
                  <View style={tw`ml-3 flex-1`}>
                    <Text style={tw`font-semibold text-ink`}>{track.title}</Text>
                    <Text style={tw`text-xs text-ink-3`}>{track.artist}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={theme.colors.brand} />}
                </PressableScale>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
