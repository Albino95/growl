import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Dimensions, Animated } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { usePressFeedback } from '../../../hooks/usePressFeedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = Math.round(SCREEN_WIDTH * 1.25);

type Props = {
  image: string | null;
  isPosting?: boolean;
  onTakePhoto: () => void;
  onPickLibrary: () => void;
  onEditPhoto: () => void;
  onRemovePhoto: () => void;
};

function ActionButton({
  icon,
  label,
  onPress,
  variant = 'primary',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}) {
  const feedback = usePressFeedback({ onPress });
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={feedback.onPress}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
      style={tw`flex-1 flex-row items-center justify-center rounded-2xl py-4 px-4 ${
        isPrimary ? 'bg-brand-600' : 'bg-white/15 border border-white/25'
      }`}
    >
      <Animated.View style={[tw`flex-row items-center`, feedback.animatedStyle]}>
        <Ionicons name={icon} size={22} color="#FFFFFF" style={tw`mr-2`} />
        <Text style={tw`font-semibold text-base text-white`}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function PostImageStage({
  image,
  isPosting,
  onTakePhoto,
  onPickLibrary,
  onEditPhoto,
  onRemovePhoto,
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
          <ActionButton icon="camera" label="Camera" onPress={onTakePhoto} variant="primary" />
          <ActionButton icon="images" label="Library" onPress={onPickLibrary} variant="secondary" />
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
          <View style={tw`absolute inset-0 bg-black/50 items-center justify-center`}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={tw`text-white mt-3 font-medium`}>Uploading...</Text>
          </View>
        )}
        <View style={tw`absolute top-3 right-3 flex-row gap-2`}>
          <IconButton icon="create-outline" onPress={onEditPhoto} />
          <IconButton icon="trash-outline" onPress={onRemovePhoto} destructive />
        </View>
      </View>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}) {
  const feedback = usePressFeedback({ onPress });
  return (
    <Pressable
      onPress={feedback.onPress}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
    >
      <Animated.View
        style={[
          tw`rounded-full p-2.5 ${destructive ? 'bg-red-500/80' : 'bg-black/50'}`,
          feedback.animatedStyle,
        ]}
      >
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  );
}
