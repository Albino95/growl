import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../ui/PrimaryButton';
import StickyFooter from '../ui/StickyFooter';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { COMPOSER_COPY } from '../../hooks/composerConfig';
import tw from '../../lib/tw';

type Props = {
  /** Omit to hide the category row (stories). */
  category?: { selected: string | null; hasCategories: boolean; onOpen: () => void };
  music?: { title: string | null; onOpen: () => void };
  publishing: boolean;
  canPublish: boolean;
  /** Inline failure banner — the draft is kept. */
  error?: { message: string; onRetry: () => void; onEdit: () => void } | null;
  onSubmit: () => void;
  onLongSubmit?: () => void;
};

/** Bottom bar: category (+ music), error banner, and the one "Share" button. */
export default function ComposerStickyBar({
  category,
  music,
  publishing,
  canPublish,
  error,
  onSubmit,
  onLongSubmit,
}: Props) {
  return (
    <StickyFooter transparent style={tw`bg-stone-900 border-t border-white/10`}>
      {error ? (
        <View
          style={tw`mb-3 rounded-2xl bg-red-500/15 border border-red-400/30 px-3 py-3`}
          accessibilityLiveRegion="assertive"
        >
          <View style={tw`flex-row items-start`}>
            <Ionicons name="alert-circle" size={18} color="#FCA5A5" style={tw`mr-2 mt-0.5`} />
            <View style={tw`flex-1 min-w-0`}>
              <Text style={tw`text-white font-semibold text-sm`}>{COMPOSER_COPY.errorTitle}</Text>
              <Text style={tw`text-white/70 text-xs mt-0.5`} numberOfLines={3}>
                {error.message}
              </Text>
            </View>
          </View>
          <View style={tw`flex-row gap-2 mt-3`}>
            <Pressable
              onPress={error.onRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry sharing"
              style={tw`flex-1 py-2.5 rounded-xl bg-white items-center`}
            >
              <Text style={tw`text-stone-900 font-bold text-sm`}>Retry</Text>
            </Pressable>
            <Pressable
              onPress={error.onEdit}
              accessibilityRole="button"
              accessibilityLabel="Edit draft"
              style={tw`flex-1 py-2.5 rounded-xl bg-white/10 border border-white/20 items-center`}
            >
              <Text style={tw`text-white font-semibold text-sm`}>Edit</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {category || music ? (
        <View style={tw`flex-row items-stretch gap-2 mb-3`}>
          {category ? (
            <Pressable
              onPress={category.onOpen}
              disabled={publishing}
              accessibilityRole="button"
              accessibilityLabel={
                category.selected
                  ? `Category: ${getCategoryLabel(category.selected)}`
                  : 'Choose a category (required)'
              }
              style={tw`flex-1 min-w-0 flex-row items-center justify-between bg-white/10 border border-white/20 rounded-2xl px-3 py-3`}
            >
              <View style={tw`flex-row items-center flex-1 min-w-0`}>
                <Ionicons name="pricetag-outline" size={18} color="#A7F3D0" style={tw`mr-2`} />
                <Text style={tw`text-white font-medium flex-1 text-sm`} numberOfLines={1}>
                  {category.selected ? getCategoryLabel(category.selected) : 'Category *'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
            </Pressable>
          ) : null}
          {music ? (
            <Pressable
              onPress={music.onOpen}
              disabled={publishing}
              accessibilityRole="button"
              accessibilityLabel={music.title ? `Music: ${music.title}` : 'Add music'}
              style={tw`w-14 flex-shrink-0 items-center justify-center bg-white/10 border border-white/20 rounded-2xl`}
            >
              <Ionicons
                name="musical-notes-outline"
                size={18}
                color={music.title ? '#A7F3D0' : '#A8A29E'}
              />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <PrimaryButton
        label={publishing ? COMPOSER_COPY.sharing : COMPOSER_COPY.share}
        onPress={onSubmit}
        onLongPress={onLongSubmit}
        disabled={!canPublish && !publishing}
        loading={publishing}
      />
      {category && !category.selected ? (
        <Text style={tw`text-amber-200/90 text-xs text-center mt-2`} accessibilityLiveRegion="polite">
          {category.hasCategories
            ? 'Choose a category above to share.'
            : 'Add interests in your profile to pick a category — it\'s required to share.'}
        </Text>
      ) : null}
    </StickyFooter>
  );
}
