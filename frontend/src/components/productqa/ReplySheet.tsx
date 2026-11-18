import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import PressableScale from '../ui/PressableScale';
import tw, { theme } from '../../lib/tw';

/**
 * One-field text sheet: a business answering a question / replying to a review
 * (also the base of AskQuestionSheet). Re-seeds from `initial` every time it opens.
 */
export default function ReplySheet({
  visible,
  title,
  quote,
  hint,
  initial = '',
  placeholder,
  maxLength,
  submitLabel,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  /** The text being answered, shown above the input. */
  quote?: string | null;
  hint?: string | null;
  initial?: string;
  placeholder: string;
  maxLength: number;
  submitLabel: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= maxLength && !busy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <View style={tw`bg-page rounded-t-sheet px-gutter pt-4 pb-8`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-title font-bold text-ink flex-1 mr-3`} numberOfLines={1}>
              {title}
            </Text>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </PressableScale>
          </View>
          {quote ? (
            <View style={tw`bg-raised rounded-control px-3 py-2.5 mb-3`}>
              <Text style={tw`text-footnote text-ink-2 leading-5`} numberOfLines={4}>
                “{quote}”
              </Text>
            </View>
          ) : null}
          {hint ? <Text style={tw`text-footnote text-ink-3 mb-3 leading-5`}>{hint}</Text> : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.placeholder}
            multiline
            autoFocus
            maxLength={maxLength + 50}
            style={tw`bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink min-h-[96px] max-h-48`}
            textAlignVertical="top"
            accessibilityLabel={placeholder}
          />
          <Text
            style={tw`text-caption mt-1.5 mb-4 text-right ${
              trimmed.length > maxLength ? 'text-red-600' : 'text-ink-3'
            }`}
          >
            {trimmed.length}/{maxLength}
          </Text>
          <PressableScale
            onPress={() => canSend && onSubmit(trimmed)}
            disabled={!canSend}
            feedback="send"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend, busy: !!busy }}
            style={tw`py-3.5 rounded-control bg-brand-600 items-center ${canSend ? '' : 'opacity-50'}`}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={tw`text-white font-bold`}>{submitLabel}</Text>}
          </PressableScale>
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
