import React from 'react';
import { View, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  /** Fired when user taps Search on keyboard or the search icon. */
  onSubmit?: () => void;
  autoFocus?: boolean;
};

export default function SearchField({
  value,
  onChangeText,
  placeholder = 'Search…',
  onSubmit,
  autoFocus,
}: Props) {
  return (
    <View
      style={tw`flex-row items-center bg-[#FFFcf7] border border-stone-200 rounded-2xl px-3 py-2.5 mb-3`}
    >
      <TouchableOpacity
        onPress={() => onSubmit?.()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Search"
        disabled={!onSubmit}
      >
        <Ionicons name="search" size={18} color="#059669" />
      </TouchableOpacity>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A8A29E"
        style={tw`flex-1 ml-2 text-[15px] text-stone-900 py-0`}
        returnKeyType="search"
        clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        onSubmitEditing={() => onSubmit?.()}
        blurOnSubmit={false}
      />
      {value.length > 0 && Platform.OS !== 'ios' ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={22} color="#A8A29E" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
