import React, { forwardRef } from 'react';
import { View, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import { type } from '../../theme/tokens';
import PressableScale from '../ui/PressableScale';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
};

/** Explore's search box: like SearchField, plus focus events so recents can show on focus. */
const ExploreSearchInput = forwardRef<TextInput, Props>(function ExploreSearchInput(
  { value, onChangeText, onSubmit, onFocus, onBlur, placeholder = 'Search people, posts, #tags' },
  ref
) {
  return (
    <View style={tw`flex-row items-center bg-card border border-line rounded-card px-3 py-2.5 mb-3`}>
      <PressableScale
        pressedScale={0.9}
        onPress={() => onSubmit?.()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Search"
        disabled={!onSubmit}
      >
        <Ionicons name="search" size={18} color={theme.colors.brand} />
      </PressableScale>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        style={[tw`flex-1 ml-2 text-ink py-0`, { fontSize: type.body.fontSize }]}
        returnKeyType="search"
        clearButtonMode={Platform.OS === 'ios' ? 'while-editing' : 'never'}
        autoCorrect={false}
        autoCapitalize="none"
        onSubmitEditing={() => onSubmit?.()}
        blurOnSubmit={false}
        accessibilityLabel="Search Explore"
        accessibilityHint="Find people, posts and hashtags"
      />
      {value.length > 0 && Platform.OS !== 'ios' ? (
        <PressableScale
          pressedScale={0.9}
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={22} color={theme.colors.iconMuted} />
        </PressableScale>
      ) : null}
    </View>
  );
});

export default ExploreSearchInput;
