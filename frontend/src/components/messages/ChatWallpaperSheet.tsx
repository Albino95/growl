import React from 'react';
import { View, Text } from 'react-native';
import tw, { useThemeColors } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
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
  const c = useThemeColors();
  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.48}>
      {({ close }) => (
        <View style={tw`px-gutter-wide pb-2`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-emerald-700 uppercase`}>
            This chat
          </Text>
          <Text style={tw`text-title font-bold text-ink mt-0.5`}>Background</Text>
          <Text style={tw`text-body text-ink-3 mt-1 mb-4`}>
            Only this conversation — pick a wash that feels right.
          </Text>
          <View style={tw`flex-row flex-wrap justify-between`}>
            {CHAT_WALLS.map((wall) => {
              const active = current === wall.id;
              return (
                <PressableScale
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
                      tw`w-full h-16 rounded-card border-2`,
                      {
                        backgroundColor: wall.swatch,
                        borderColor: active ? c.brand : c.line,
                      },
                    ]}
                  />
                  <Text
                    style={tw`text-footnote mt-1.5 ${
                      active ? 'text-emerald-800 font-bold' : 'text-ink-2 font-medium'
                    }`}
                  >
                    {wall.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      )}
    </AnimatedBottomSheet>
  );
}
