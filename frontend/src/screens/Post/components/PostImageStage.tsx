import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import GrowLoader from '../../../components/ui/GrowLoader';
import { feedback } from '../../../utils/interactionFeedback';
import tw from '../../../lib/tw';

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
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={tw`flex-row items-center rounded-full px-3.5 py-2.5 mr-2 flex-shrink-0 ${
        danger
          ? 'bg-red-500/80 border border-red-400/40'
          : active
            ? 'bg-brand-600'
            : 'bg-white/15 border border-white/20'
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
      <View style={tw`flex-1 items-center justify-center px-6 bg-brand-900`}>
        <View style={tw`items-center mb-10`}>
          <Pressable
            onLongPress={() => feedback.egg()}
            delayLongPress={450}
            style={tw`bg-white/15 rounded-full p-5 mb-4 border border-white/20`}
          >
            <Ionicons name="images" size={48} color="#FFFFFF" />
          </Pressable>
          <Text style={tw`text-white text-2xl font-bold mb-2 text-center`}>Plant a post</Text>
          <Text style={tw`text-white/70 text-base text-center px-4`}>
            Camera or library — then grade, crop, and caption before you share
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
      <View style={tw`flex-1 min-h-0 bg-black`}>
        <Image
          source={{ uri: image }}
          style={tw`w-full h-full`}
          contentFit="cover"
          transition={160}
        />
        <View style={tw`absolute bottom-0 left-0 right-0 h-24 bg-black/35`} pointerEvents="none" />
        {isPosting ? (
          <View style={tw`absolute inset-0 bg-black/55 items-center justify-center z-30`}>
            <GrowLoader label="Planting your post…" />
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={tw`px-4 py-3 items-center`}
        style={tw`flex-grow-0 flex-shrink-0`}
      >
        <ToolChip icon="color-wand-outline" label="Edit" onPress={onEditPhoto} />
        <ToolChip
          icon="musical-notes-outline"
          label="Music"
          onPress={onOpenMusic}
          active={hasMusic}
        />
        <ToolChip icon="images-outline" label="Replace" onPress={onPickLibrary} />
        <ToolChip icon="trash-outline" label="Remove" danger onPress={onRemovePhoto} />
      </ScrollView>
    </View>
  );
}
