import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import HeartBurst from '../../../components/feed/HeartBurst';
import FeedReelMedia from '../../../components/feed/FeedReelMedia';
import FeedLikeButton, { type FeedReaction } from '../../../components/feed/FeedLikeButton';
import PressableScale from '../../../components/ui/PressableScale';
import GrowAvatar from '../../../components/ui/GrowAvatar';
import type { VideoEditSettings } from '../../../components/ui/VideoEditor';
import type { ProfilePreview } from '../../../app/navigation/RootNavigator';

export type FeedCardPost = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image: string;
  caption: string;
  category: string;
  subcategory?: string;
  likes: number;
  comments: number;
  timestamp: string;
  hasLiked: boolean;
  reaction: FeedReaction;
  /** Friends (of viewer) who liked — from API when available */
  friendLikesCount?: number;
  friendLikers?: string[];
  isFriend?: boolean;
  isOwn?: boolean;
  audioUrl?: string;
  audioTitle?: string;
  isReel?: boolean;
  isInstructor?: boolean;
  mediaType?: string;
  contentType?: string;
  videoEdit?: VideoEditSettings | null;
  /** Reel poster image (metadata.cover_url). */
  posterUri?: string;
};

export type FeedPostCardProps = {
  item: FeedCardPost;
  /** True only for the primary visible post while the feed is focused (drives reel autoplay). */
  isActive: boolean;
  mediaFailed: boolean;
  heartBurstKey: number;
  isAudioPlaying: boolean;
  // Handlers must be referentially stable (they receive the post / id) so memo holds.
  onOpenProfile: (userId: string, preview?: ProfilePreview) => void;
  onOpenMenu: (post: FeedCardPost) => void;
  onMediaPress: (post: FeedCardPost) => void;
  onMediaError: (postId: string) => void;
  onMediaRetry: (postId: string) => void;
  onLikePress: (postId: string) => void;
  onLikeLongPress: (postId: string) => void;
  onOpenComments: (post: FeedCardPost) => void;
  onShare: (post: FeedCardPost) => void;
  onOpenLikes: (post: FeedCardPost, mode: 'all' | 'friends') => void;
  onToggleAudio: (post: FeedCardPost) => void;
  onOpenPost: (post: FeedCardPost) => void;
};

/** One Home feed post. Memoized so scroll-driven `isActive` changes only re-render affected cards. */
function FeedPostCard({
  item,
  isActive,
  mediaFailed,
  heartBurstKey,
  isAudioPlaying,
  onOpenProfile,
  onOpenMenu,
  onMediaPress,
  onMediaError,
  onMediaRetry,
  onLikePress,
  onLikeLongPress,
  onOpenComments,
  onShare,
  onOpenLikes,
  onToggleAudio,
  onOpenPost,
}: FeedPostCardProps) {
  return (
    <View
      style={tw`mx-5 mb-4 overflow-hidden rounded-2xl bg-[#FFFcf7] border border-stone-200/70 ${
        item.isReel ? 'border-stone-300/60' : ''
      }`}
    >
      {/* Post Header - Modern Style */}
      <View style={tw`flex-row items-center justify-between px-4 py-3`}>
        <TouchableOpacity
          style={tw`flex-row items-center flex-1`}
          onPress={() => onOpenProfile(item.userId, { username: item.username, avatarUrl: item.avatar })}
        >
          <GrowAvatar
            userId={item.userId}
            username={item.username}
            uri={item.avatar}
            size={44}
            style={tw`mr-3`}
          />
            <View style={tw`flex-1`}>
            <Text style={tw`font-bold text-stone-900 text-base`}>{item.username}</Text>
            <View style={tw`flex-row items-center flex-wrap gap-1 mt-0.5`}>
              <Text style={tw`text-xs text-stone-500`}>{item.timestamp}</Text>
              <View style={tw`px-2 py-0.5 rounded-full bg-brand-50`}>
                <Text style={tw`text-[11px] font-semibold text-brand-800`}>
                  {item.subcategory
                    ? `${item.category} · ${item.subcategory}`
                    : item.category}
                </Text>
              </View>
              {item.isInstructor ? (
                <View style={tw`px-2 py-0.5 rounded-full bg-emerald-100 flex-row items-center`}>
                  <Ionicons name="school" size={10} color="#047857" />
                  <Text style={tw`text-[11px] font-semibold text-emerald-800 ml-0.5`}>
                    Instructor
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={tw`p-2 -mr-1 z-10`}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => onOpenMenu(item)}
          accessibilityRole="button"
          accessibilityLabel="Post options"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#57534E" />
        </TouchableOpacity>
      </View>
      {(item.isFriend || item.isOwn) && (
        <View style={tw`px-4 pb-2`}>
          <View
            style={tw`self-start rounded-full px-2.5 py-1 ${
              item.isOwn ? 'bg-emerald-100' : 'bg-stone-100'
            }`}
          >
            <Text
              style={tw`text-[11px] font-semibold ${
                item.isOwn ? 'text-emerald-800' : 'text-stone-700'
              }`}
            >
              {item.isOwn ? 'Your post' : 'Friend'}
            </Text>
          </View>
        </View>
      )}

      {/* Post Image — double-tap to like */}
      <Pressable onPress={() => onMediaPress(item)} style={tw`relative w-full bg-stone-50`}>
        <FeedReelMedia
          uri={item.image}
          postId={item.id}
          isReel={item.isReel}
          mediaType={item.mediaType}
          contentType={item.contentType}
          videoEdit={item.videoEdit}
          posterUri={item.posterUri}
          failed={mediaFailed}
          isActive={isActive}
          muted
          onError={() => onMediaError(item.id)}
          onRetry={() => onMediaRetry(item.id)}
        />
        <HeartBurst triggerKey={heartBurstKey} />
      </Pressable>

      {/* Post Actions - Modern Style */}
      <View style={tw`px-4 py-3`}>
        <View style={tw`flex-row items-center justify-between mb-3`}>
          <View style={tw`flex-row items-center`}>
            <FeedLikeButton
              hasLiked={item.hasLiked}
              reaction={item.reaction}
              onPress={() => onLikePress(item.id)}
              onLongPress={() => onLikeLongPress(item.id)}
            />
            <PressableScale
              onPress={() => onOpenComments(item)}
              hitSlop={8}
              style={tw`mr-3.5`}
              feedback="open"
              accessibilityRole="button"
              accessibilityLabel="Comments"
            >
              <Ionicons name="chatbubble-outline" size={24} color="#57534E" />
            </PressableScale>
            <PressableScale
              onPress={() => onShare(item)}
              hitSlop={8}
              feedback="open"
              accessibilityRole="button"
              accessibilityLabel="Share post card"
            >
              <Ionicons name="paper-plane-outline" size={24} color="#57534E" />
            </PressableScale>
          </View>
        </View>

        <View style={tw`flex-row items-center flex-wrap mb-2`}>
          <TouchableOpacity onPress={() => onOpenLikes(item, 'all')} activeOpacity={0.7}>
            <Text style={[tw`font-bold text-stone-900 text-[15px]`, { fontVariant: ['tabular-nums'] }]}>
              {item.likes} {item.likes === 1 ? 'like' : 'likes'}
            </Text>
          </TouchableOpacity>
          {item.comments > 0 ? (
            <>
              <Text style={tw`text-stone-300 mx-2`}>·</Text>
              <TouchableOpacity onPress={() => onOpenComments(item)} activeOpacity={0.7}>
                <Text style={[tw`font-semibold text-stone-600 text-[15px]`, { fontVariant: ['tabular-nums'] }]}>
                  {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        {(item.friendLikesCount ?? 0) > 0 ? (
          <TouchableOpacity onPress={() => onOpenLikes(item, 'friends')} activeOpacity={0.7}>
            <Text style={[tw`text-emerald-700 font-semibold mb-2 text-sm`, { fontVariant: ['tabular-nums'] }]}>
              {item.friendLikesCount} from friends
            </Text>
          </TouchableOpacity>
        ) : null}
        {(item.friendLikers?.length ?? 0) > 0 ? (
          <Text style={tw`text-xs text-stone-600 mb-2`}>
            Liked by friends: {item.friendLikers?.slice(0, 3).join(', ')}
            {(item.friendLikers?.length ?? 0) > 3
              ? ` +${(item.friendLikers?.length ?? 0) - 3} more`
              : ''}
          </Text>
        ) : null}

        {/* Caption */}
        <View style={tw`mb-2 flex-row flex-wrap`}>
          <TouchableOpacity
            onPress={() => onOpenProfile(item.userId, { username: item.username, avatarUrl: item.avatar })}
          >
            <Text style={tw`font-bold text-stone-900 text-base`}>{item.username}</Text>
          </TouchableOpacity>
          <Text style={tw`text-stone-900 text-base`}> {item.caption}</Text>
        </View>

        {item.audioTitle ? (
          <Pressable
            onPress={() => onToggleAudio(item)}
            style={tw`flex-row items-center self-start bg-brand-50 border border-brand-200 rounded-full px-3 py-1.5 mb-2`}
          >
            <Ionicons
              name={isAudioPlaying ? 'pause' : 'musical-notes'}
              size={14}
              color="#059669"
            />
            <Text style={tw`text-brand-800 text-xs font-semibold ml-1.5`}>
              {item.audioTitle}
            </Text>
          </Pressable>
        ) : null}

        {item.isReel ? (
          <Pressable
            onPress={() => onOpenPost(item)}
            style={tw`mb-2 flex-row items-center self-start bg-emerald-50 border border-emerald-200/80 rounded-full px-3 py-1.5`}
          >
            <Ionicons name="film-outline" size={14} color="#059669" />
            <Text style={tw`text-emerald-800 text-xs font-semibold ml-1.5`}>
              Watch in Reels
            </Text>
          </Pressable>
        ) : null}

        {/* Comments */}
        {item.comments > 0 && (
          <TouchableOpacity onPress={() => onOpenComments(item)}>
            <Text style={tw`text-stone-500 text-sm mb-1`}>
              View all {item.comments} {item.comments === 1 ? 'comment' : 'comments'}
            </Text>
          </TouchableOpacity>
        )}
        {item.comments === 0 ? (
          <TouchableOpacity onPress={() => onOpenComments(item)}>
            <Text style={tw`text-stone-500 text-xs mb-1`}>No comments yet</Text>
          </TouchableOpacity>
        ) : null}

        {/* Add Comment */}
        <TouchableOpacity
          onPress={() => onOpenComments(item)}
          style={tw`mt-2`}
        >
          <Text style={tw`text-stone-500 text-sm`}>Add a comment...</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default memo(FeedPostCard);
