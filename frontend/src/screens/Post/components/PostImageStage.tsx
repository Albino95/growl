import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = Math.round(SCREEN_WIDTH * 1.25);
const HEADER_OFFSET = 56;

type Props = {
  image: string | null;
  isPosting?: boolean;
  hasMusic?: boolean;
  onTakePhoto: () => void;
  onPickLibrary: () => void;
  onEditPhoto: () => void;
  onRemovePhoto: () => void;
  onOpenMusic: () => void;
};

function ToolChip({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`flex-row items-center rounded-full px-3 py-2 mr-2 ${
        active ? 'bg-brand-600' : 'bg-white/15 border border-white/20'
      }`}
      hitSlop={6}
    >
      <Ionicons name={icon} size={16} color="#FFFFFF" />
      <Text style={tw`text-white text-xs font-semibold ml-1.5`}>{label}</Text>
    </Pressable>
  );
}

export default function PostImageStage({
  image,
  isPosting,
  hasMusic,
  onTakePhoto,
  onPickLibrary,
  onEditPhoto,
  onRemovePhoto,
  onOpenMusic,
}: Props) {
  if (!image) {
    return (
      <View style={[tw`flex-1 items-center justify-center px-6 bg-brand-900`, { minHeight: IMAGE_HEIGHT }]}>
        <View style={tw`items-center mb-10`}>
          <View style={tw`bg-white/15 rounded-full p-5 mb-4 border border-white/20`}>
            <Ionicons name="images" size={48} color="#FFFFFF" />
          </View>
          <Text style={tw`text-white text-2xl font-bold mb-2 text-center`}>Share your moment</Text>
          <Text style={tw`text-white/70 text-base text-center px-4`}>
            Take a photo or choose from your library to get started
          </Text>
        </View>
        <View style={tw`flex-row gap-3 w-full`}>
          <Pressable
            onPress={onTakePhoto}
            style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-brand-600`}
          >
            <Ionicons name="camera" size={22} color="#FFFFFF" style={tw`mr-2`} />
            <Text style={tw`font-semibold text-base text-white`}>Camera</Text>
          </Pressable>
          <Pressable
            onPress={onPickLibrary}
            style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 bg-white/15 border border-white/25`}
          >
            <Ionicons name="images" size={22} color="#FFFFFF" style={tw`mr-2`} />
            <Text style={tw`font-semibold text-base text-white`}>Library</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={tw`flex-1`}>
      <View style={[tw`w-full relative`, { height: IMAGE_HEIGHT }]}>
        <Image
          source={{ uri: image }}
          style={tw`w-full h-full`}
          contentFit="cover"
          transition={200}
        />
        <View style={tw`absolute bottom-0 left-0 right-0 h-32 bg-black/40`} pointerEvents="none" />
        {isPosting && (
          <View style={tw`absolute inset-0 bg-black/50 items-center justify-center z-30`}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={tw`text-white mt-3 font-medium`}>Uploading...</Text>
          </View>
        )}
        <View
          style={[tw`absolute right-3 flex-row`, { top: HEADER_OFFSET, zIndex: 30 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={onEditPhoto}
            style={tw`rounded-full p-2.5 bg-black/55 mr-2`}
            hitSlop={8}
            accessibilityLabel="Edit photo filters"
          >
            <Ionicons name="color-wand-outline" size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={onRemovePhoto}
            style={tw`rounded-full p-2.5 bg-red-500/85`}
            hitSlop={8}
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`px-4 py-3`}
        style={tw`flex-grow-0`}
      >
        <ToolChip icon="color-wand-outline" label="Edit" onPress={onEditPhoto} />
        <ToolChip icon="musical-notes-outline" label="Music" onPress={onOpenMusic} active={hasMusic} />
        <ToolChip icon="images-outline" label="Replace" onPress={onPickLibrary} />
      </ScrollView>
    </View>
  );
}
