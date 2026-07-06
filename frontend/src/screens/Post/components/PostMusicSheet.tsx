import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POST_MUSIC_TRACKS, type PostMusicTrack } from '../../../constants/postMusic';
import tw from '../../../lib/tw';

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedTrack: PostMusicTrack | null;
  onSelectTrack: (track: PostMusicTrack | null) => void;
};

export default function PostMusicSheet({ visible, onClose, selectedTrack, onSelectTrack }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={tw`flex-1 bg-black/50 justify-end`} onPress={onClose}>
        <Pressable
          style={[tw`bg-white rounded-t-3xl px-4 pt-4`, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Add music</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#78716C" />
            </Pressable>
          </View>

          <Text style={tw`text-sm text-stone-500 mb-3`}>
            Optional soundtrack for your post. Listeners can preview it on the feed.
          </Text>

          <ScrollView style={tw`max-h-72`} showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => {
                onSelectTrack(null);
                onClose();
              }}
              style={tw`flex-row items-center py-3 border-b border-stone-100`}
            >
              <Ionicons name="volume-mute-outline" size={22} color="#78716C" />
              <Text style={tw`ml-3 text-stone-700 font-medium`}>No music</Text>
              {!selectedTrack && <Ionicons name="checkmark" size={20} color="#059669" style={tw`ml-auto`} />}
            </Pressable>

            {POST_MUSIC_TRACKS.map((track) => {
              const active = selectedTrack?.id === track.id;
              return (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    onSelectTrack(track);
                    onClose();
                  }}
                  style={tw`flex-row items-center py-3 border-b border-stone-100`}
                >
                  <View style={tw`w-10 h-10 rounded-xl bg-brand-50 items-center justify-center`}>
                    <Ionicons name="musical-notes" size={20} color="#059669" />
                  </View>
                  <View style={tw`ml-3 flex-1`}>
                    <Text style={tw`font-semibold text-stone-900`}>{track.title}</Text>
                    <Text style={tw`text-xs text-stone-500`}>{track.artist}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color="#059669" />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
