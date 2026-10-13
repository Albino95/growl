import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, Text, View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';

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
    key: 'journal',
    title: 'Journal entry',
    subtitle: 'Private by default — reflect on a skill or goal',
    icon: 'book-outline',
  },
  {
    key: 'post',
    title: 'New post',
    subtitle: 'Share progress with your circle',
    icon: 'image-outline',
  },
  {
    key: 'reel',
    title: 'New reel',
    subtitle: 'Show a skill unlock in motion',
    icon: 'film-outline',
  },
  {
    key: 'story',
    title: 'New story',
    subtitle: 'Ephemeral update for 24 hours',
    icon: 'ellipse-outline',
  },
];

function ActionRow({
  action,
  index,
  visible,
  onSelect,
}: {
  action: (typeof ACTIONS)[number];
  index: number;
  visible: boolean;
  onSelect: (key: CreateAction) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(14);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        delay: 40 + index * 45,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: 40 + index * 45,
        useNativeDriver: true,
        speed: 18,
        bounciness: 7,
      }),
    ]).start();
  }, [visible, index, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Pressable
        onPress={() => {
          feedback.open();
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
    </Animated.View>
  );
}

/** Bottom sheet for the dock create (+) control. */
export default function CreateActionSheet({ visible, onClose, onSelect }: Props) {
  const sheetY = useRef(new Animated.Value(40)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      sheetY.setValue(40);
      sheetOpacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
    ]).start();
  }, [visible, sheetOpacity, sheetY]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={tw`flex-1 justify-end`}>
        <Pressable
          style={[tw`absolute inset-0 bg-black/35`, { zIndex: 1 }]}
          onPress={() => {
            feedback.close();
            onClose();
          }}
          accessibilityLabel="Dismiss create menu"
        />
        <Animated.View
          style={[
            tw`bg-[#FFFcf7] rounded-t-3xl px-5 pt-3 pb-8 border-t border-stone-200`,
            {
              zIndex: 2,
              opacity: sheetOpacity,
              transform: [{ translateY: sheetY }],
            },
          ]}
        >
          <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
          <Text style={tw`text-lg font-semibold text-stone-900 mb-1`}>Create</Text>
          <Text style={tw`text-sm text-stone-500 mb-4`}>
            Journal, share progress, or find your next skill — Shop is always in the tab bar.
          </Text>

          {ACTIONS.map((action, index) => (
            <ActionRow
              key={action.key}
              action={action}
              index={index}
              visible={visible}
              onSelect={onSelect}
            />
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}
