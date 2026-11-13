import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Text, View } from 'react-native';
import tw, { theme } from '../../lib/tw';
import { type } from '../../theme/tokens';
import PressableScale from './PressableScale';

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
          tw`px-gutter py-2.5 flex-row justify-end border-t`,
          { backgroundColor: theme.colors.page, borderTopColor: theme.colors.line },
        ]}
      >
        <PressableScale
          pressedScale={0.9}
          onPress={() => Keyboard.dismiss()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={tw`px-3 py-1.5 rounded-chip bg-brand-50`}
        >
          <Text style={{ color: theme.colors.leafInk, fontWeight: '700', fontSize: type.callout.fontSize }}>
            Done
          </Text>
        </PressableScale>
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
