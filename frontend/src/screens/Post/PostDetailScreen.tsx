import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import CommentsScreen from '../Comments/CommentsScreen';
import DecayCountdownChip from '../../components/profile/DecayCountdownChip';
import { resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import GrowAvatar from '../../components/ui/GrowAvatar';
import { getFeedPost, toggleFeedPostLike } from '../../services/api/feed';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import { feedback } from '../../utils/interactionFeedback';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import { useAppDispatch } from '../../store/hooks';
import { patchFeedPostEngagement } from '../../store/slices/feedSlice';

type ReactionType = 'like' | 'love' | 'laugh' | 'wow' | 'support' | null;

type Post = {
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
  timestamp?: string;
  createdAt?: string;
  hasLiked?: boolean;
  reaction?: ReactionType;
  daysUntilDecay?: number;
};

type RouteParams = {
  PostDetail: {
    post: Post;
  };
};

export default function PostDetailScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { post: initialPost } = route.params;

  const imageUri = resolvePostMediaUri(initialPost.image, initialPost.category, initialPost.id);
  const avatarUri = resolveAvatarUri(initialPost.userId, initialPost.username, initialPost.avatar);

  const [post, setPost] = useState<Post>({ ...initialPost, image: imageUri, avatar: avatarUri });
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [sharePayload, setSharePayload] = useState<ShareCardPayload | null>(null);

  // Hydrate like state from the server — route params are often stale after re-login.
  useEffect(() => {
    let cancelled = false;
    void getFeedPost(initialPost.id).then((remote) => {
      if (cancelled || !remote) return;
      const liked = !!remote.metadata?.has_liked;
      setPost((prev) => ({
        ...prev,
        likes: Number(remote.metadata?.likes ?? prev.likes),
        comments: Number(remote.metadata?.comments ?? prev.comments),
        hasLiked: liked,
        reaction: liked ? prev.reaction || 'love' : null,
        image: resolvePostMediaUri(remote.image_url, remote.category, remote.id) || prev.image,
        caption: remote.caption || prev.caption,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [initialPost.id]);

  const openShareCard = () => {
    feedback.open();
    setSharePayload({
      kind: 'post',
      postId: post.id,
      userId: post.userId,
      username: post.username,
      avatar: post.avatar,
      caption: post.caption,
      imageUrl: post.image,
      category: post.category,
      subcategory: post.subcategory,
    });
  };

  const renderReactionIcon = () => {
    const active = post.hasLiked || post.reaction != null;
    if (!active) return <Ionicons name="heart-outline" size={28} color={theme.colors.icon} />;
    const r = post.reaction || 'love';
    switch (r) {
      case 'like':
        return <Text style={tw`text-2xl`}>👍</Text>;
      case 'love':
        return <Ionicons name="heart" size={28} color="#EF4444" />;
      case 'laugh':
        return <Text style={tw`text-2xl`}>😂</Text>;
      case 'wow':
        return <Text style={tw`text-2xl`}>😮</Text>;
      case 'support':
        return <Text style={tw`text-2xl`}>💪</Text>;
      default:
        return <Ionicons name="heart" size={28} color="#EF4444" />;
    }
  };

  // Keep the feed's copy of this post in sync with likes made here, so the
  // count and heart match when the user goes back.
  const engagementSynced = useRef(false);
  useEffect(() => {
    if (!engagementSynced.current) {
      engagementSynced.current = true;
      return;
    }
    dispatch(patchFeedPostEngagement({ id: post.id, likes: post.likes, has_liked: post.hasLiked }));
  }, [dispatch, post.id, post.likes, post.hasLiked]);

  /** True while a like/reaction toggle is in flight; further taps are ignored until it settles. */
  const likePendingRef = useRef(false);
  const postRef = useRef(post);
  postRef.current = post;

  /** Optimistic like: flip heart + count now, reconcile with the server, roll back on failure. */
  const toggleLike = async () => {
    if (likePendingRef.current) return;
    likePendingRef.current = true;
    const before = postRef.current;
    const wasLiked = !!before.hasLiked || before.reaction != null;
    const nextLiked = !wasLiked;
    // Like = soft + like tone; unlike = light, silent.
    haptic(nextLiked ? 'like' : 'unlike');
    setPost((prev) => ({
      ...prev,
      hasLiked: nextLiked,
      likes: nextLiked ? before.likes + 1 : Math.max(0, before.likes - 1),
      reaction: nextLiked ? prev.reaction || 'love' : null,
    }));
    try {
      const res = await toggleFeedPostLike(before.id);
      const liked = !!res.data?.liked;
      if (liked !== nextLiked) {
        // Server disagrees (e.g. stale state) — trust it.
        setPost((prev) => ({
          ...prev,
          hasLiked: liked,
          likes: liked
            ? wasLiked
              ? before.likes
              : before.likes + 1
            : Math.max(0, before.likes - (wasLiked ? 1 : 0)),
          reaction: liked ? prev.reaction || 'love' : null,
        }));
      }
    } catch {
      setPost((prev) => ({
        ...prev,
        hasLiked: before.hasLiked,
        likes: before.likes,
        reaction: before.reaction ?? null,
      }));
      toast.info('Couldn’t update like — check your connection', { icon: 'cloud-offline-outline' });
    } finally {
      likePendingRef.current = false;
    }
  };

  /** Optimistic reaction pick: only touches the server when liked/unliked actually flips. */
  const setReaction = async (reaction: ReactionType) => {
    setShowReactionPicker(false);
    if (likePendingRef.current) return;
    const before = postRef.current;
    const wasLiked = !!before.hasLiked || before.reaction != null;
    const willLike = reaction !== null;
    if (willLike && !wasLiked) haptic('tapLight');
    setPost((prev) => ({
      ...prev,
      reaction,
      hasLiked: willLike,
      likes: willLike === wasLiked ? before.likes : willLike ? before.likes + 1 : Math.max(0, before.likes - 1),
    }));
    if (willLike === wasLiked) return;
    likePendingRef.current = true;
    try {
      await toggleFeedPostLike(before.id);
    } catch {
      setPost((prev) => ({
        ...prev,
        reaction: before.reaction ?? null,
        hasLiked: before.hasLiked,
        likes: before.likes,
      }));
      toast.info('Couldn’t update reaction — check your connection', { icon: 'cloud-offline-outline' });
    } finally {
      likePendingRef.current = false;
    }
  };

  const navigateToProfile = () => {
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.dispatch(CommonActions.navigate('PublicProfile', { userId: post.userId, preview: { username: post.username, avatarUrl: post.avatar } }));
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-card`} edges={['top']}>
      <KeyboardAvoidingView style={tw`flex-1`} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line bg-card`}>
          <PressableScale
            pressedScale={0.9}
            onPress={() => navigation.goBack()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.icon} />
          </PressableScale>
          <Text style={tw`text-callout font-semibold text-ink`}>Post</Text>
          <PressableScale pressedScale={0.9} onPress={openShareCard} hitSlop={10} accessibilityLabel="Share post">
            <Ionicons name="ellipsis-horizontal" size={24} color={theme.colors.icon} />
          </PressableScale>
        </View>

        <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
          <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line`}>
            <PressableScale style={tw`flex-row items-center flex-1`} onPress={navigateToProfile}>
              <GrowAvatar
                userId={post.userId}
                username={post.username}
                uri={post.avatar}
                size={48}
                style={tw`mr-3`}
              />
              <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-ink text-base`}>{post.username}</Text>
                <Text style={tw`text-xs text-ink-3`}>
                  {post.timestamp ||
                    (post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '')}
                </Text>
              </View>
            </PressableScale>
          </View>

          <View style={tw`w-full bg-stone-50`}>
            <Image
              source={{ uri: post.image }}
              style={tw`w-full h-96 bg-stone-100`}
              contentFit="cover"
              transition={200}
            />
          </View>

          <View style={tw`px-gutter py-3 border-b border-line`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <View style={tw`flex-row items-center`}>
                <PressableScale
                  pressedScale={0.9}
                  onPress={() => void toggleLike()}
                  onLongPress={() => setShowReactionPicker(!showReactionPicker)}
                  style={tw`mr-3`}
                  accessibilityRole="button"
                  accessibilityLabel={post.hasLiked || post.reaction != null ? 'Unlike' : 'Like'}
                  accessibilityState={{ selected: !!post.hasLiked || post.reaction != null }}
                >
                  {renderReactionIcon()}
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={() => setShowComments(true)} style={tw`mr-3`}>
                  <Ionicons name="chatbubble-outline" size={26} color={theme.colors.icon} />
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={openShareCard} accessibilityLabel="Share post card">
                  <Ionicons name="paper-plane-outline" size={26} color={theme.colors.brand} />
                </PressableScale>
              </View>
              <PressableScale pressedScale={0.9}>
                <Ionicons name="bookmark-outline" size={26} color={theme.colors.icon} />
              </PressableScale>
            </View>

            {showReactionPicker && (
              <View style={tw`absolute left-4 top-12 bg-card rounded-chip px-3 py-2 flex-row items-center shadow-lg border border-line z-10`}>
                <PressableScale pressedScale={0.9} onPress={() => void setReaction('like')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>👍</Text>
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={() => void setReaction('love')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>❤️</Text>
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={() => void setReaction('laugh')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😂</Text>
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={() => void setReaction('wow')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😮</Text>
                </PressableScale>
                <PressableScale pressedScale={0.9} onPress={() => void setReaction('support')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>💪</Text>
                </PressableScale>
              </View>
            )}

            <Text style={tw`font-bold text-ink mb-2 text-base`}>
              {post.likes} {post.likes === 1 ? 'like' : 'likes'}
            </Text>

            <View style={tw`mb-2 flex-row flex-wrap`}>
              <PressableScale onPress={navigateToProfile}>
                <Text style={tw`font-bold text-ink text-base`}>{post.username}</Text>
              </PressableScale>
              <Text style={tw`text-ink text-base`}> {post.caption}</Text>
            </View>

            {post.daysUntilDecay !== undefined && (
              <View style={tw`mt-2`}>
                <DecayCountdownChip daysLeft={post.daysUntilDecay} />
              </View>
            )}

            <PressableScale onPress={() => setShowComments(true)} style={tw`mt-2`}>
              <Text style={tw`text-ink-3 text-sm`}>
                {post.comments > 0
                  ? `View all ${post.comments} ${post.comments === 1 ? 'comment' : 'comments'}`
                  : 'Add a comment…'}
              </Text>
            </PressableScale>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showComments && (
        <Modal
          visible={showComments}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowComments(false)}
        >
          <CommentsScreen
            postId={post.id}
            postUsername={post.username}
            postUserId={post.userId}
            postCaption={post.caption}
            onClose={() => setShowComments(false)}
          />
        </Modal>
      )}

      <ShareCardSheet
        visible={!!sharePayload}
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
      />
    </SafeAreaView>
  );
}
