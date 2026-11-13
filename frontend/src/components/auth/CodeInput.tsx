import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import tw from '../../lib/tw';
import { formInputAccessoryProps } from '../ui/KeyboardDoneAccessory';
import { runShake } from './authMotion';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { spring } from '../../theme/motion';

export const CODE_LENGTH = 6;

export type CodeInputHandle = {
  focus: () => void;
  blur: () => void;
  /** Shake the boxes and clear the value (wrong code). */
  rejectAndClear: () => void;
};

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  /** Fires once each time the value reaches 6 digits. */
  onComplete?: (code: string) => void;
  hasError?: boolean;
  reducedMotion?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

function Digit({
  char,
  active,
  hasError,
  reducedMotion,
}: {
  char: string;
  active: boolean;
  hasError: boolean;
  reducedMotion: boolean;
}) {
  const pop = useRef(new Animated.Value(char ? 1 : 0)).current;
  const caret = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!char) {
      pop.setValue(0);
      return;
    }
    if (reducedMotion) {
      pop.setValue(0);
      const a = Animated.timing(pop, { toValue: 1, duration: 120, useNativeDriver: true });
      a.start();
      return () => a.stop();
    }
    pop.setValue(0);
    const a = spring(pop, 1, 'bouncy');
    a.start();
    return () => a.stop();
  }, [char, pop, reducedMotion]);

  useEffect(() => {
    if (!active || char || reducedMotion) {
      caret.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caret, { toValue: 0, duration: 450, delay: 350, useNativeDriver: true }),
        Animated.timing(caret, { toValue: 1, duration: 120, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, char, caret, reducedMotion]);

  const borderColor = hasError ? '#DC2626' : active ? '#059669' : 'rgba(214,211,209,0.8)';
  const scale = reducedMotion ? 1 : pop.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  return (
    <View
      style={[
        tw`flex-1 rounded-2xl bg-[#FFFcf7] items-center justify-center`,
        { height: 56, borderWidth: active || hasError ? 1.5 : 1, borderColor },
      ]}
    >
      {char ? (
        <Animated.Text
          style={[tw`text-2xl font-semibold text-stone-900`, { opacity: pop, transform: [{ scale }] }]}
        >
          {char}
        </Animated.Text>
      ) : active ? (
        <Animated.View style={[styles.caret, { opacity: caret }]} />
      ) : null}
    </View>
  );
}

/**
 * Six visible boxes backed by one hidden TextInput so iOS one-time-code
 * autofill, Android SMS autofill, and paste all work.
 */
const CodeInput = forwardRef<CodeInputHandle, Props>(function CodeInput(
  {
    value,
    onChangeText,
    onComplete,
    hasError = false,
    reducedMotion: reducedMotionProp,
    autoFocus = true,
    disabled,
    accessibilityLabel = 'Verification code',
  },
  ref
) {
  // Falls back to the OS setting so the pop + caret loop are always gated.
  const osReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? osReducedMotion;
  const inputRef = useRef<TextInput>(null);
  const shakeX = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);
  const lastCompleted = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    rejectAndClear: () => {
      runShake(shakeX, reducedMotion);
      lastCompleted.current = null;
      onChangeText('');
      inputRef.current?.focus();
    },
  }));

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    onChangeText(digits);
    if (digits.length < CODE_LENGTH) {
      lastCompleted.current = null;
      return;
    }
    if (lastCompleted.current !== digits) {
      lastCompleted.current = digits;
      onComplete?.(digits);
    }
  };

  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);
  const accessory = formInputAccessoryProps();

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessible={false}
      disabled={disabled}
    >
      <Animated.View style={[tw`flex-row gap-2`, { transform: [{ translateX: shakeX }] }]}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <Digit
            key={i}
            char={value[i] ?? ''}
            active={focused && !disabled && i === activeIndex && (value.length < CODE_LENGTH || i === CODE_LENGTH - 1)}
            hasError={hasError}
            reducedMotion={reducedMotion}
          />
        ))}
      </Animated.View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        maxLength={CODE_LENGTH}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        contextMenuHidden={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputAccessoryViewID={accessory.inputAccessoryViewID}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Enter the 6-digit code"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  caret: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#059669',
  },
  // Kept on top of the boxes (transparent) so long-press → Paste works natively.
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.011,
    color: 'transparent',
    fontSize: 1,
  },
});

export default CodeInput;
