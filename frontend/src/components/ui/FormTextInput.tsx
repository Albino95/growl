import React, { forwardRef } from 'react';
import {
  TextInput,
  type TextInputProps,
  type TextInput as TextInputType,
  StyleProp,
  TextStyle,
} from 'react-native';
import tw, { theme } from '../../lib/tw';
import { type } from '../../theme/tokens';
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
    ? null
    : formInputAccessoryProps(accessoryId, { multiline: !!props.multiline });
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.placeholder}
      {...(accessory ?? {})}
      {...props}
      // Keep accessory id after props so callers can't accidentally strip Done.
      {...(accessory ? { inputAccessoryViewID: accessory.inputAccessoryViewID } : {})}
      style={[
        tw`bg-page border rounded-card px-4 py-3 text-ink`,
        // fontSize only: a lineHeight on single-line iOS inputs shifts the baseline.
        { fontSize: type.body.fontSize, borderColor: error ? theme.colors.danger : theme.colors.line },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
});

export default FormTextInput;
