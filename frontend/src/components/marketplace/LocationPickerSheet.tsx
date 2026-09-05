import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

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
        <TouchableOpacity style={tw`flex-1`} activeOpacity={1} onPress={onClose} />
        <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-5 pb-8 max-h-[88%]`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View
            style={tw`flex-row items-center bg-white border border-stone-200 rounded-2xl px-3 py-2.5 mb-3`}
          >
            <Ionicons name="search" size={18} color="#78716C" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor="#A8A29E"
              style={tw`flex-1 ml-2 text-[15px] text-stone-900 py-0`}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
            />
            {query.length > 0 && Platform.OS !== 'ios' ? (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={20} color="#A8A29E" />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={tw`text-xs text-stone-500 mb-2`}>
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
                <Text style={tw`text-stone-500 text-center px-6`}>{emptyMessage}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected = item.key === selectedKey;
              return (
                <TouchableOpacity
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={tw`flex-row items-center py-3.5 border-b border-stone-200/70`}
                >
                  <View style={tw`flex-1 pr-3`}>
                    <Text
                      style={tw`text-[15px] ${selected ? 'font-bold text-emerald-800' : 'font-medium text-stone-900'}`}
                    >
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text style={tw`text-xs text-stone-500 mt-0.5`}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color="#059669" /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
