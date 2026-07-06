import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CATEGORIES from '../../../data/categories';
import Chip from '../../../components/ui/Chip';
import tw from '../../../lib/tw';

type Props = {
  visible: boolean;
  onClose: () => void;
  userCategories: string[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string) => void;
};

function getCategoryLabel(cat: string): string {
  const category = CATEGORIES.find((c) => c.key === cat || c.key === cat.split(':')[0]);
  const subcategory = cat.includes(':')
    ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
    : null;
  return subcategory ? subcategory.label : category?.label || cat;
}

export default function PostCategorySheet({
  visible,
  onClose,
  userCategories,
  selectedCategory,
  onSelectCategory,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={tw`flex-1 bg-black/50 justify-end`} onPress={onClose}>
        <Pressable
          style={[tw`bg-white rounded-t-3xl px-4 pt-4`, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={tw`flex-row items-center justify-between mb-4`}>
            <Text style={tw`text-lg font-bold text-stone-900`}>Choose category</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color="#78716C" />
            </Pressable>
          </View>

          {userCategories.length === 0 ? (
            <View style={tw`py-6 items-center`}>
              <Ionicons name="grid-outline" size={40} color="#A8A29E" />
              <Text style={tw`text-stone-600 text-center mt-3 px-4`}>
                Add interests in your profile to choose a category for your post.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`mb-2`}>
              <View style={tw`flex-row flex-wrap`}>
                {userCategories.map((cat) => (
                  <View key={cat} style={tw`flex-row items-center`}>
                    <Chip
                      selected={selectedCategory === cat}
                      onPress={() => {
                        onSelectCategory(cat);
                        onClose();
                      }}
                    >
                      {selectedCategory === cat ? `✓ ${getCategoryLabel(cat)}` : getCategoryLabel(cat)}
                    </Chip>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { getCategoryLabel };
