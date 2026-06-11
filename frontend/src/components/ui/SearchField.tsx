import React from 'react';
import { View, TextInput, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
};

export default function SearchField({ value, onChangeText, placeholder = 'Search…' }: Props) {
  return (
    <View
      style={tw`flex-row items-center bg-white border border-stone-200 rounded-2xl px-3 py-2.5 mb-3`}
    >
      <Ionicons name="search" size={18} color="#78716C" />
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
      />
      {value.length > 0 && Platform.OS !== 'ios' ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={22} color="#A8A29E" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
