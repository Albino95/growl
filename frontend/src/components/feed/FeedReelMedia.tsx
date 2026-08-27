import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { isVideoMedia } from '../../services/api/media';
import { ReelVideoPlayer, type VideoEditSettings } from '../ui/VideoEditor';
import tw from '../../lib/tw';

type Props = {
  uri: string;
  postId: string;
  isReel?: boolean;
  mediaType?: string | null;
  contentType?: string | null;
  videoEdit?: Partial<VideoEditSettings> | null;
  failed?: boolean;
  onError?: () => void;
};

/** Feed/profile media tile — shows video preview for reels instead of a broken Image. */
export default function FeedReelMedia({
  uri,
  postId,
  isReel,
  mediaType,
  contentType,
  videoEdit,
  failed,
  onError,
}: Props) {
  const isVideo = !!isReel && isVideoMedia({ uri, mediaType, contentType });

  if (isVideo && uri && !failed) {
    return (
      <View style={tw`w-full h-96 bg-black`}>
        <ReelVideoPlayer
          uri={uri}
          settings={videoEdit}
          shouldPlay={false}
          useNativeControls={false}
          style={tw`w-full h-full`}
        />
      </View>
    );
  }

  if (uri && uri.trim() !== '' && !failed) {
    return (
      <Image
        source={{ uri }}
        style={tw`w-full h-96`}
        contentFit="cover"
        onError={onError}
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
        transition={200}
      />
    );
  }

  return (
    <View style={tw`w-full h-96 bg-stone-100 items-center justify-center`}>
      <Ionicons name="image-outline" size={64} color="#9CA3AF" />
    </View>
  );
}
