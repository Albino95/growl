import React, { forwardRef } from 'react';
import {
  TextInput,
  type TextInputProps,
  type TextInput as TextInputType,
  StyleProp,
  TextStyle,
} from 'react-native';
import tw from '../../lib/tw';
import { FORM_KEYBOARD_DONE_ID, formInputAccessoryProps } from './KeyboardDoneAccessory';

type Props = TextInputProps & {
  accessoryId?: string;
  /** Skip Done accessory (e.g. search fields that use returnKeyType="search"). */
  disableDoneAccessory?: boolean;
  error?: boolean;
};

const FormTextInput = forwardRef<TextInputType, Props>(function FormTextInput(
  { accessoryId = FORM_KEYBOARD_DONE_ID, disableDoneAccessory, error, style, ...props },
  ref
) {
  const accessory = disableDoneAccessory
    ? {}
    : formInputAccessoryProps(accessoryId, { multiline: !!props.multiline });
  return (
    <TextInput
      ref={ref}
      placeholderTextColor="#A8A29E"
      {...accessory}
      {...props}
      // Keep accessory id after props so callers can't accidentally strip Done.
      {...(disableDoneAccessory
        ? {}
        : { inputAccessoryViewID: accessory.inputAccessoryViewID })}
      style={[
        tw`bg-surface-page border rounded-2xl px-4 py-3 text-[15px] text-stone-900`,
        { borderColor: error ? '#F87171' : 'rgba(231,229,228,0.9)' },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
});

export default FormTextInput;
