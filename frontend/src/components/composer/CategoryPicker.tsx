import React from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Chip from '../ui/Chip';
import { getCategoryLabel } from '../../utils/categoryLabels';
import tw from '../../lib/tw';

type Props = {
  visible: boolean;
  onClose: () => void;
  userCategories: string[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string) => void;
};

/** Bottom sheet: pick the growth path this share belongs to. */
export default function CategoryPicker({
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
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close categories"
            >
              <Ionicons name="close" size={24} color="#6B645E" />
            </Pressable>
          </View>

          {userCategories.length === 0 ? (
            <View style={tw`py-6 items-center`}>
              <Ionicons name="grid-outline" size={40} color="#A8A29E" />
              <Text style={tw`text-stone-600 text-center mt-3 px-4`}>
                Add interests in your profile to choose a category.
              </Text>
            </View>
          ) : (
            <ScrollView style={tw`max-h-72 mb-2`} showsVerticalScrollIndicator={false}>
              <View style={tw`flex-row flex-wrap`}>
                {userCategories.map((cat) => {
                  const selected = selectedCategory === cat;
                  const label = getCategoryLabel(cat);
                  return (
                    <Chip
                      key={cat}
                      selected={selected}
                      onPress={() => {
                        onSelectCategory(cat);
                        onClose();
                      }}
                    >
                      {selected ? `✓ ${label}` : label}
                    </Chip>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
