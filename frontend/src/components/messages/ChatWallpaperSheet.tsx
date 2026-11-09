import React from 'react';
import { View, Text, Pressable } from 'react-native';
import tw from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import { CHAT_WALLS, type ChatWallId } from '../../state/useChatWallpaperStore';
import { feedback } from '../../utils/interactionFeedback';

type Props = {
  visible: boolean;
  current: ChatWallId;
  onClose: () => void;
  onPick: (id: ChatWallId) => void;
};

export default function ChatWallpaperSheet({ visible, current, onClose, onPick }: Props) {
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.48}>
      {({ close }) => (
        <View style={tw`px-5 pb-2`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
            This chat
          </Text>
          <Text style={tw`text-[24px] font-bold text-stone-900 mt-0.5`}>Background</Text>
          <Text style={tw`text-sm text-stone-500 mt-1 mb-4`}>
            Only this conversation — pick a wash that feels right.
          </Text>
          <View style={tw`flex-row flex-wrap justify-between`}>
            {CHAT_WALLS.map((wall) => {
              const active = current === wall.id;
              return (
                <Pressable
                  key={wall.id}
                  onPress={() => {
                    feedback.select();
                    onPick(wall.id);
                    close();
                  }}
                  style={tw`w-[31%] mb-3 items-center`}
                >
                  <View
                    style={[
                      tw`w-full h-16 rounded-2xl border-2`,
                      {
                        backgroundColor: wall.swatch,
                        borderColor: active ? '#059669' : 'rgba(28,25,23,0.08)',
                      },
                    ]}
                  />
                  <Text
                    style={tw`text-[12px] mt-1.5 ${
                      active ? 'text-emerald-800 font-bold' : 'text-stone-600 font-medium'
                    }`}
                  >
                    {wall.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
