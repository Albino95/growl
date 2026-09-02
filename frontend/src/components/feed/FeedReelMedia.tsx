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
  /** Feed cards must stay muted; full audio only in Reels viewer */
  muted?: boolean;
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
  muted = true,
  onError,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const mediaW = Math.min(screenW - 40, 420);
  const reelH = Math.round(mediaW * (16 / 9));
  const photoH = 384;
  const baseSettings =
    reelPlaybackSettingsFromMetadata(videoEdit ? { video_edit: videoEdit } : null) ??
    videoEdit ??
    null;
  const playbackSettings = muted
    ? {
        ...(baseSettings || {}),
        originalVolume: 0,
        audioVolume: 0,
        audioTrackId: null,
        audioUrl: null,
      }
    : baseSettings;
  const isVideo = !!isReel && !failed && isVideoMedia({ uri, mediaType, contentType });
  const height = isReel ? reelH : photoH;

  if (isVideo && uri) {
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
    <View style={[tw`w-full bg-[#EAE4D6] items-center justify-center`, { height }]}>
      <Ionicons name="image-outline" size={48} color="#A8A29E" />
      <Text style={tw`text-stone-500 text-sm mt-2`}>Media unavailable</Text>
    </View>
  );
}
