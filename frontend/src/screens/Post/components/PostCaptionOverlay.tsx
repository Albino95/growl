import React, { RefObject } from 'react';
import { View, TextInput, Text } from 'react-native';
import tw from '../../../lib/tw';

type Props = {
  caption: string;
  onChangeCaption: (text: string) => void;
  inputRef?: RefObject<TextInput | null>;
  visible?: boolean;
};

export default function PostCaptionOverlay({
  caption,
  onChangeCaption,
  inputRef,
  visible = true,
}: Props) {
  if (!visible) return null;

  const nearLimit = caption.length >= 450;

  return (
    <View style={tw`px-4 pb-2`}>
      <TextInput
        ref={inputRef}
        placeholder="Write a caption..."
        placeholderTextColor="rgba(255,255,255,0.55)"
        multiline
        value={caption}
        onChangeText={onChangeCaption}
        style={tw`text-white text-base min-h-[44px] max-h-28`}
        maxLength={500}
        returnKeyType="default"
        textAlignVertical="top"
      />
      <Text style={tw`text-xs mt-1 ${nearLimit ? 'text-amber-400' : 'text-white/50'}`}>
        {caption.length}/500
      </Text>
    </View>
  );
}
