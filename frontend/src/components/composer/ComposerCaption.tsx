import React, { RefObject } from 'react';
import {
  View,
  TextInput,
  Text,
  Keyboard,
  Platform,
  InputAccessoryView,
} from 'react-native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';

const CAPTION_ACCESSORY_ID = 'composer-caption-done';

type Props = {
  caption: string;
  onChangeCaption: (text: string) => void;
  maxLength: number;
  inputRef?: RefObject<TextInput | null>;
  editable?: boolean;
};

/** Caption field shared by every create flow. */
export default function ComposerCaption({
  caption,
  onChangeCaption,
  maxLength,
  inputRef,
  editable = true,
}: Props) {
  const nearLimit = caption.length >= Math.floor(maxLength * 0.9);

  return (
    <View style={tw`px-gutter pb-2`}>
      <View style={tw`flex-row items-center justify-between mb-1`}>
        <Text style={tw`text-caption font-semibold tracking-widest text-white/60 uppercase`}>
          Caption
        </Text>
        <PressableScale
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done writing caption"
          style={tw`px-3 py-1.5 rounded-chip bg-white/15`}
        >
          <Text style={tw`text-white text-xs font-bold`}>Done</Text>
        </PressableScale>
      </View>
      <TextInput
        ref={inputRef}
        placeholder="Write a caption…"
        placeholderTextColor="rgba(255,255,255,0.55)"
        multiline
        value={caption}
        onChangeText={onChangeCaption}
        editable={editable}
        style={tw`text-white text-base min-h-[44px] max-h-28`}
        maxLength={maxLength}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={() => Keyboard.dismiss()}
        inputAccessoryViewID={Platform.OS === 'ios' ? CAPTION_ACCESSORY_ID : undefined}
        textAlignVertical="top"
        accessibilityLabel="Caption"
      />
      <Text style={tw`text-xs mt-1 ${nearLimit ? 'text-amber-400' : 'text-white/50'}`}>
        {caption.length}/{maxLength}
      </Text>
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={CAPTION_ACCESSORY_ID}>
          <View style={tw`bg-[#1C1917] border-t border-white/10 px-4 py-2 flex-row justify-end`}>
            <PressableScale onPress={() => Keyboard.dismiss()} hitSlop={8}>
              <Text style={tw`text-emerald-400 font-bold text-base`}>Done</Text>
            </PressableScale>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}
