import React, { RefObject } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  Keyboard,
  Platform,
  InputAccessoryView,
} from 'react-native';
import tw from '../../../lib/tw';

const CAPTION_ACCESSORY_ID = 'post-caption-done';

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
      <View style={tw`flex-row items-center justify-between mb-1`}>
        <Text style={tw`text-[11px] font-semibold tracking-widest text-white/60 uppercase`}>
          Caption
        </Text>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done writing caption"
          style={tw`px-3 py-1.5 rounded-full bg-white/15`}
        >
          <Text style={tw`text-white text-xs font-bold`}>Done</Text>
        </Pressable>
      </View>
      <TextInput
        ref={inputRef}
        placeholder="Write a caption..."
        placeholderTextColor="rgba(255,255,255,0.55)"
        multiline
        value={caption}
        onChangeText={onChangeCaption}
        style={tw`text-white text-base min-h-[44px] max-h-28`}
        maxLength={500}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        inputAccessoryViewID={Platform.OS === 'ios' ? CAPTION_ACCESSORY_ID : undefined}
        textAlignVertical="top"
      />
      <Text style={tw`text-xs mt-1 ${nearLimit ? 'text-amber-400' : 'text-white/50'}`}>
        {caption.length}/500
      </Text>
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={CAPTION_ACCESSORY_ID}>
          <View style={tw`bg-[#1C1917] border-t border-white/10 px-4 py-2 flex-row justify-end`}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={tw`text-emerald-400 font-bold text-base`}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}
