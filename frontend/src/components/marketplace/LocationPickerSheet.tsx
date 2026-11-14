import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import {
  FORM_KEYBOARD_DONE_ID,
  KeyboardDoneAccessory,
} from '../ui/KeyboardDoneAccessory';

export type LocationOption = {
  key: string;
  label: string;
  subtitle?: string;
};

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  options: LocationOption[];
  selectedKey?: string;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (option: LocationOption) => void;
};

export default function LocationPickerSheet({
  visible,
  title,
  placeholder = 'Search…',
  options,
  selectedKey,
  emptyMessage = 'No matches. Try a different search.',
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle && o.subtitle.toLowerCase().includes(q)) ||
        o.key.toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={tw`flex-1 justify-end bg-black/40`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PressableScale style={tw`flex-1`} onPress={onClose} />
        <View style={tw`bg-page rounded-t-sheet px-gutter-wide pt-5 pb-8 max-h-[88%]`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-ink`}>{title}</Text>
            <PressableScale accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.colors.ink3} />
            </PressableScale>
          </View>

          <View
            style={tw`flex-row items-center bg-card border border-line rounded-card px-3 py-2.5 mb-3`}
          >
            <Ionicons name="search" size={18} color={theme.colors.ink3} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.ink3}
              style={tw`flex-1 ml-2 text-body text-ink py-0`}
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
              inputAccessoryViewID={Platform.OS === 'ios' ? FORM_KEYBOARD_DONE_ID : undefined}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            />
            {query.length > 0 && Platform.OS !== 'ios' ? (
              <PressableScale accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.colors.iconMuted} />
              </PressableScale>
            ) : null}
          </View>

          <Text style={tw`text-xs text-ink-3 mb-2`}>
            {filtered.length.toLocaleString()} result{filtered.length === 1 ? '' : 's'}
          </Text>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={24}
            maxToRenderPerBatch={40}
            windowSize={10}
            ListEmptyComponent={
              <View style={tw`py-10 items-center`}>
                <Text style={tw`text-ink-3 text-center px-6`}>{emptyMessage}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected = item.key === selectedKey;
              return (
                <PressableScale
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={tw`flex-row items-center py-3.5 border-b border-line/70`}
                >
                  <View style={tw`flex-1 pr-3`}>
                    <Text
                      style={tw`text-body ${selected ? 'font-bold text-emerald-800' : 'font-medium text-ink'}`}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text style={tw`text-xs text-ink-3 mt-0.5`}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={theme.colors.brand} /> : null}
                </PressableScale>
              );
            }}
          />
        </View>
        <KeyboardDoneAccessory />
      </KeyboardAvoidingView>
    </Modal>
  );
}
