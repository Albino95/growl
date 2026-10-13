import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native';
import tw from '../../lib/tw';

/** Shared nativeID for form fields that should share one iOS Done bar. */
export const FORM_KEYBOARD_DONE_ID = 'grow-form-keyboard-done';

/** iOS keyboard accessory with a Done control that dismisses the keyboard. */
export function KeyboardDoneAccessory({
  nativeID = FORM_KEYBOARD_DONE_ID,
}: {
  nativeID?: string;
}) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        style={[
          tw`px-4 py-2.5 flex-row justify-end border-t`,
          { backgroundColor: '#F3EEE4', borderTopColor: '#E7E5E4' },
        ]}
      >
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={tw`px-3 py-1.5 rounded-full bg-brand-50`}
        >
          <Text style={{ color: '#059669', fontWeight: '700', fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

export function formInputAccessoryProps(
  nativeIDOrOpts: string | { nativeID?: string; multiline?: boolean } = FORM_KEYBOARD_DONE_ID,
  maybeOpts?: { multiline?: boolean }
) {
  const opts =
    typeof nativeIDOrOpts === 'string'
      ? { nativeID: nativeIDOrOpts, ...(maybeOpts || {}) }
      : nativeIDOrOpts || {};
  const nativeID = opts.nativeID || FORM_KEYBOARD_DONE_ID;
  const multiline = !!opts.multiline;
  return {
    // Multiline needs Return for newlines; Done lives on the accessory bar.
    returnKeyType: (multiline ? 'default' : 'done') as 'default' | 'done',
    blurOnSubmit: !multiline,
    ...(multiline ? {} : { onSubmitEditing: () => Keyboard.dismiss() }),
    inputAccessoryViewID: Platform.OS === 'ios' ? nativeID : undefined,
  };
}
