import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { triggerPressFeedback } from '../../utils/interactionFeedback';

export type CreateAction = 'post' | 'reel' | 'story' | 'journal';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: CreateAction) => void;
};

const ACTIONS: Array<{
  key: CreateAction;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: 'post',
    title: 'New post',
    subtitle: 'Share progress with your circle',
    icon: 'image-outline',
  },
  {
    key: 'reel',
    title: 'New reel',
    subtitle: 'Vertical clip with pro video & photo edits',
    icon: 'film-outline',
  },
  {
    key: 'story',
    title: 'New story',
    subtitle: 'Ephemeral update for 24 hours',
    icon: 'ellipse-outline',
  },
  {
    key: 'journal',
    title: 'Journal entry',
    subtitle: 'Private by default — reflect first',
    icon: 'book-outline',
  },
];

/** Bottom sheet for the dock create (+) control. */
export default function CreateActionSheet({ visible, onClose, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 justify-end`}>
        <Pressable
          style={tw`absolute inset-0 bg-black/35`}
          onPress={onClose}
          accessibilityLabel="Dismiss create menu"
        />
        <View style={tw`bg-[#FFFcf7] rounded-t-3xl px-5 pt-3 pb-8 border-t border-stone-200`}>
          <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
          <Text style={tw`text-lg font-semibold text-stone-900 mb-1`}>Create</Text>
          <Text style={tw`text-sm text-stone-500 mb-4`}>What do you want to add?</Text>

          {ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => {
                triggerPressFeedback();
                onSelect(action.key);
              }}
              style={({ pressed }) => [
                tw`flex-row items-center rounded-2xl px-4 py-3.5 mb-2 border border-stone-200`,
                { backgroundColor: pressed ? '#F5F0E8' : '#FFFFFF' },
              ]}
            >
              <View style={tw`w-11 h-11 rounded-full bg-stone-900 items-center justify-center`}>
                <Ionicons name={action.icon} size={20} color="#FFFFFF" />
              </View>
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`text-stone-900 font-semibold`}>{action.title}</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>{action.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
