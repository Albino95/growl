import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
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
import tw from '../../lib/tw';
import ShareCardSheet, { type ShareCardPayload } from '../../components/share/ShareCardSheet';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
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
    if (!active) return <Ionicons name="heart-outline" size={28} color="#374151" />;
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

  const toggleLike = async () => {
    try {
      const res = await toggleFeedPostLike(post.id);
      const liked = !!res.data?.liked;
      setPost((prev) => ({
        ...prev,
        hasLiked: liked,
        likes: liked ? prev.likes + (prev.hasLiked ? 0 : 1) : Math.max(0, prev.likes - (prev.hasLiked ? 1 : 0)),
        reaction: liked ? prev.reaction || 'love' : null,
      }));
    } catch {
      // The like didn't reach the server: leave the heart as it was.
      void alertMessage('Could not update like', 'Check your connection and try again.');
    }
  };

  const setReaction = async (reaction: ReactionType) => {
    setShowReactionPicker(false);
    const wasLiked = post.hasLiked || post.reaction != null;
    try {
      if (reaction === null) {
        if (wasLiked) await toggleFeedPostLike(post.id);
        setPost((prev) => ({
          ...prev,
          reaction: null,
          hasLiked: false,
          likes: Math.max(0, prev.likes - (wasLiked ? 1 : 0)),
        }));
        return;
      }
      if (!wasLiked) await toggleFeedPostLike(post.id);
      setPost((prev) => ({
        ...prev,
        reaction,
        hasLiked: true,
        likes: prev.likes + (wasLiked ? 0 : 1),
      }));
    } catch {
      /* keep local state */
    }
  };

  const navigateToProfile = () => {
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.dispatch(CommonActions.navigate('PublicProfile', { userId: post.userId }));
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
      <KeyboardAvoidingView style={tw`flex-1`} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-200 bg-white`}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-stone-900`}>Post</Text>
          <TouchableOpacity onPress={openShareCard} hitSlop={10} accessibilityLabel="Share post">
            <Ionicons name="ellipsis-horizontal" size={24} color="#57534E" />
          </TouchableOpacity>
        </View>

        <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
          <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-100`}>
            <TouchableOpacity style={tw`flex-row items-center flex-1`} onPress={navigateToProfile}>
              <GrowAvatar
                userId={post.userId}
                username={post.username}
                uri={post.avatar}
                size={48}
                style={tw`mr-3`}
              />
              <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-stone-900 text-base`}>{post.username}</Text>
                <Text style={tw`text-xs text-stone-500`}>
                  {post.timestamp ||
                    (post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={tw`w-full bg-stone-50`}>
            <Image
              source={{ uri: post.image }}
              style={tw`w-full h-96 bg-stone-100`}
              contentFit="cover"
              transition={200}
            />
          </View>

          <View style={tw`px-4 py-3 border-b border-stone-100`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <View style={tw`flex-row items-center`}>
                <TouchableOpacity
                  onPress={() => void toggleLike()}
                  onLongPress={() => setShowReactionPicker(!showReactionPicker)}
                  style={tw`mr-3`}
                >
                  {renderReactionIcon()}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowComments(true)} style={tw`mr-3`}>
                  <Ionicons name="chatbubble-outline" size={26} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity onPress={openShareCard} accessibilityLabel="Share post card">
                  <Ionicons name="paper-plane-outline" size={26} color="#059669" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity>
                <Ionicons name="bookmark-outline" size={26} color="#374151" />
              </TouchableOpacity>
            </View>

            {showReactionPicker && (
              <View style={tw`absolute left-4 top-12 bg-white rounded-full px-3 py-2 flex-row items-center shadow-lg border border-stone-200 z-10`}>
                <TouchableOpacity onPress={() => void setReaction('like')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>👍</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void setReaction('love')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>❤️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void setReaction('laugh')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😂</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void setReaction('wow')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😮</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void setReaction('support')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>💪</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={tw`font-bold text-stone-900 mb-2 text-base`}>
              {post.likes} {post.likes === 1 ? 'like' : 'likes'}
            </Text>

            <View style={tw`mb-2 flex-row flex-wrap`}>
              <TouchableOpacity onPress={navigateToProfile}>
                <Text style={tw`font-bold text-stone-900 text-base`}>{post.username}</Text>
              </TouchableOpacity>
              <Text style={tw`text-stone-900 text-base`}> {post.caption}</Text>
            </View>

            {post.daysUntilDecay !== undefined && (
              <View style={tw`mt-2`}>
                <DecayCountdownChip daysLeft={post.daysUntilDecay} />
              </View>
            )}

            <TouchableOpacity onPress={() => setShowComments(true)} style={tw`mt-2`}>
              <Text style={tw`text-stone-500 text-sm`}>
                {post.comments > 0
                  ? `View all ${post.comments} ${post.comments === 1 ? 'comment' : 'comments'}`
                  : 'Add a comment…'}
              </Text>
            </TouchableOpacity>
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
