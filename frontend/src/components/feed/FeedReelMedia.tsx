import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
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
  onRetry?: () => void;
};

/** True only for actual video files — never force Image URLs into the video player. */
function shouldUseVideoPlayer(opts: {
  uri: string;
  isReel?: boolean;
  mediaType?: string | null;
  contentType?: string | null;
  videoEdit?: Partial<VideoEditSettings> | null;
}): boolean {
  if (opts.mediaType === 'image') return false;
  if (opts.mediaType === 'video') return true;
  if (isVideoMedia({ uri: opts.uri, mediaType: opts.mediaType, contentType: opts.contentType })) {
    return true;
  }
  // Legacy reels with video_edit but missing media_type
  if (opts.isReel && opts.videoEdit && opts.mediaType !== 'image') return true;
  return false;
}

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
  onRetry,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const mediaW = Math.min(screenW - 40, 420);
  const reelH = Math.round(mediaW * (16 / 9));
  const photoH = 384;
  const [retryToken, setRetryToken] = useState(0);
  const [localFailed, setLocalFailed] = useState(false);

  useEffect(() => {
    setLocalFailed(false);
  }, [uri, postId]);

  const baseSettings =
    reelPlaybackSettingsFromMetadata(videoEdit ? { video_edit: videoEdit } : null) ??
    videoEdit ??
    null;
  // Feed autoplay stays silent (platform policy + UX). Full sound lives in Reels.
  const playbackSettings = muted
    ? {
        ...(baseSettings || {}),
        originalVolume: 0,
        audioVolume: 0,
        audioTrackId: null,
        audioUrl: null,
      }
    : baseSettings;

  const treatAsVideo = shouldUseVideoPlayer({
    uri,
    isReel,
    mediaType,
    contentType,
    videoEdit,
  });

  const height = treatAsVideo || isReel ? reelH : photoH;
  const showFailed = (failed || localFailed) && !treatAsVideo;
  const displayUri =
    retryToken > 0 && uri
      ? `${uri}${uri.includes('?') ? '&' : '?'}_r=${retryToken}`
      : uri;

  const handleImageError = useCallback(() => {
    if (retryToken < 1 && uri) {
      setRetryToken((t) => t + 1);
      return;
    }
    setLocalFailed(true);
    onError?.();
  }, [onError, retryToken, uri]);

  const handleRetry = useCallback(() => {
    setLocalFailed(false);
    setRetryToken((t) => t + 1);
    onRetry?.();
  }, [onRetry]);

  if (treatAsVideo && uri) {
    return (
      <View style={[tw`w-full bg-black items-center`, { height }]}>
        <View style={[tw`h-full bg-black overflow-hidden`, { width: mediaW, maxWidth: '100%' }]}>
          <ReelVideoPlayer
            key={`${postId}-${retryToken}`}
            uri={displayUri}
            settings={playbackSettings}
            shouldPlay={isActive}
            useNativeControls={false}
            contentFit="cover"
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

  if (displayUri && displayUri.trim() !== '' && !showFailed) {
    return (
      <View style={[tw`w-full items-center`, { height }]}>
        <View style={[tw`h-full overflow-hidden bg-stone-200`, { width: mediaW, maxWidth: '100%' }]}>
          <Image
            key={`${postId}-${retryToken}`}
            source={{ uri: displayUri }}
            style={tw`w-full h-full`}
            contentFit="cover"
            onError={handleImageError}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
            transition={200}
          />
          {isReel ? (
            <View
              style={tw`absolute bottom-3 right-3 flex-row items-center bg-black/50 px-2.5 py-1 rounded-full`}
              pointerEvents="none"
            >
              <Ionicons name="play" size={12} color="#fff" />
              <Text style={tw`text-white text-[10px] font-bold ml-1`}>Reel</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  // Soft placeholder — never show "Media unavailable" copy
  return (
    <Pressable
      onPress={handleRetry}
      style={[tw`w-full bg-[#EAE4D6] items-center justify-center`, { height }]}
      accessibilityLabel="Reload media"
    >
      <Ionicons name="image-outline" size={40} color="#A8A29E" />
      <Text style={tw`text-stone-500 text-sm mt-2 font-medium`}>Tap to reload</Text>
    </Pressable>
  );
}
