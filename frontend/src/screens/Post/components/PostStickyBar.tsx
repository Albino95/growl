import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../../components/ui/PrimaryButton';
import StickyFooter from '../../../components/ui/StickyFooter';
import { getCategoryLabel } from './PostCategorySheet';
import tw from '../../../lib/tw';

type Props = {
  selectedCategory: string | null;
  audioTrack?: { id: string; title: string; url: string } | null;
  hasImage: boolean;
  isPosting: boolean;
  canPost: boolean;
  onOpenCategory: () => void;
  onOpenMusic?: () => void;
  onSubmit: () => void;
  /** Override primary CTA (default: Share Post). */
  submitLabel?: string;
};

export default function PostStickyBar({
  selectedCategory,
  audioTrack,
  hasImage,
  isPosting,
  canPost,
  onOpenCategory,
  onOpenMusic,
  onSubmit,
  submitLabel = 'Share Post',
}: Props) {
  return (
    <StickyFooter transparent style={tw`bg-stone-900 border-t border-white/10`}>
      {hasImage && (
        <View style={tw`flex-row gap-2 mb-3`}>
          <Pressable
            onPress={onOpenCategory}
            style={tw`flex-1 flex-row items-center justify-between bg-white/10 border border-white/20 rounded-2xl px-3 py-3`}
          >
            <View style={tw`flex-row items-center flex-1`}>
              <Ionicons name="pricetag-outline" size={18} color="#A7F3D0" style={tw`mr-2`} />
              <Text style={tw`text-white font-medium flex-1 text-sm`} numberOfLines={1}>
                {selectedCategory ? getCategoryLabel(selectedCategory) : 'Category *'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A8A29E" />
          </Pressable>
          {onOpenMusic ? (
            <Pressable
              onPress={onOpenMusic}
              style={tw`flex-row items-center bg-white/10 border border-white/20 rounded-2xl px-3 py-3`}
            >
              <Ionicons
                name="musical-notes-outline"
                size={18}
                color={audioTrack ? '#A7F3D0' : '#A8A29E'}
              />
            </Pressable>
          ) : null}
        </View>
      )}
      <PrimaryButton
        label={submitLabel}
        onPress={onSubmit}
        disabled={!canPost}
        loading={isPosting}
      />
      {hasImage && !selectedCategory && (
        <Text style={tw`text-white/50 text-xs text-center mt-2`}>
          Photo and category are required
        </Text>
      )}
    </StickyFooter>
  );
}
