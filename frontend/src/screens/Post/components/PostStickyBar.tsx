import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../../components/ui/PrimaryButton';
import StickyFooter from '../../../components/ui/StickyFooter';
import { getCategoryLabel } from './PostCategorySheet';
import tw from '../../../lib/tw';

type Props = {
  selectedCategory: string | null;
  hasImage: boolean;
  isPosting: boolean;
  canPost: boolean;
  onOpenCategory: () => void;
  onSubmit: () => void;
};

export default function PostStickyBar({
  selectedCategory,
  hasImage,
  isPosting,
  canPost,
  onOpenCategory,
  onSubmit,
}: Props) {
  return (
    <StickyFooter transparent style={tw`bg-stone-900 border-t border-white/10`}>
      {hasImage && (
        <Pressable
          onPress={onOpenCategory}
          style={tw`flex-row items-center justify-between bg-white/10 border border-white/20 rounded-2xl px-4 py-3 mb-3`}
        >
          <View style={tw`flex-row items-center flex-1`}>
            <Ionicons name="pricetag-outline" size={18} color="#A7F3D0" style={tw`mr-2`} />
            <Text style={tw`text-white font-medium flex-1`} numberOfLines={1}>
              {selectedCategory ? getCategoryLabel(selectedCategory) : 'Choose category *'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
        </Pressable>
      )}
      <PrimaryButton
        label="Share Post"
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
