import React from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { isVideoMedia } from '../../services/api/media';
import { ReelVideoPlayer, type VideoEditSettings } from '../ui/VideoEditor';
import { reelPlaybackSettingsFromMetadata } from '../../utils/reelMedia';
import tw from '../../lib/tw';

type Props = {
  uri: string;
  postId: string;
  isReel?: boolean;
  mediaType?: string | null;
  contentType?: string | null;
  videoEdit?: Partial<VideoEditSettings> | null;
  failed?: boolean;
  isActive?: boolean;
  onError?: () => void;
};

/** Feed/profile media — portrait reels with muted autoplay when visible. */
export default function FeedReelMedia({
  uri,
  postId,
  isReel,
  mediaType,
  contentType,
  videoEdit,
  failed,
  isActive = false,
  onError,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const mediaW = Math.min(screenW - 40, 420);
  const reelH = Math.round(mediaW * (16 / 9));
  const photoH = 384;
  const playbackSettings =
    reelPlaybackSettingsFromMetadata(videoEdit ? { video_edit: videoEdit } : null) ??
    videoEdit ??
    null;
  const isVideo = !!isReel && isVideoMedia({ uri, mediaType, contentType });
  const height = isReel ? reelH : photoH;

  if (isVideo && uri && !failed) {
    return (
      <View style={[tw`w-full bg-black items-center`, { height }]}>
        <View style={[tw`h-full bg-black overflow-hidden`, { width: mediaW, maxWidth: '100%' }]}>
          <ReelVideoPlayer
            uri={uri}
            settings={playbackSettings}
            shouldPlay={isActive}
            useNativeControls={false}
            style={tw`w-full h-full`}
          />
          <View
            style={tw`absolute bottom-3 right-3 flex-row items-center bg-black/50 px-2.5 py-1 rounded-full`}
            pointerEvents="none"
          >
            <Ionicons name="play" size={12} color="#fff" />
            <Text style={tw`text-white text-[10px] font-bold ml-1`}>Reel</Text>
          </View>
        </View>
      </View>
    );
  }

  if (uri && uri.trim() !== '' && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[tw`w-full`, { height }]}
        contentFit="cover"
        onError={onError}
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
        transition={200}
      />
    );
  }

  return (
    <View style={[tw`w-full bg-stone-100 items-center justify-center`, { height }]}>
      <Ionicons name="image-outline" size={64} color="#9CA3AF" />
    </View>
  );
}
