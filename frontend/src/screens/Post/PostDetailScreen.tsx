import React, { useState } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
import { resolveAvatarUri, resolvePostMediaUri } from '../../utils/images';
import { toggleFeedPostLike } from '../../services/api/feed';
import tw from '../../lib/tw';

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
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { post: initialPost } = route.params;

  const imageUri = resolvePostMediaUri(initialPost.image, initialPost.category, initialPost.id);
  const avatarUri = resolveAvatarUri(initialPost.userId, initialPost.username, initialPost.avatar);

  const [post, setPost] = useState<Post>({ ...initialPost, image: imageUri, avatar: avatarUri });
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

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
      setPost((prev) => ({
        ...prev,
        hasLiked: !prev.hasLiked,
        likes: prev.hasLiked ? Math.max(0, prev.likes - 1) : prev.likes + 1,
        reaction: prev.hasLiked ? null : 'love',
      }));
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
    rootNavigation.navigate('PublicProfile' as never, { userId: post.userId } as never);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
      <KeyboardAvoidingView style={tw`flex-1`} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white`}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-gray-900`}>Post</Text>
          <TouchableOpacity>
            <Ionicons name="ellipsis-horizontal" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
          <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-100`}>
            <TouchableOpacity style={tw`flex-row items-center flex-1`} onPress={navigateToProfile}>
              <Image
                source={{ uri: post.avatar }}
                style={tw`w-12 h-12 rounded-full mr-3 bg-stone-100`}
                contentFit="cover"
              />
              <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-gray-900 text-base`}>{post.username}</Text>
                <Text style={tw`text-xs text-gray-500`}>
                  {post.timestamp ||
                    (post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '')}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={tw`w-full bg-gray-50`}>
            <Image
              source={{ uri: post.image }}
              style={tw`w-full h-96 bg-stone-100`}
              contentFit="cover"
              transition={200}
            />
          </View>

          <View style={tw`px-4 py-3 border-b border-gray-100`}>
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
                <TouchableOpacity>
                  <Ionicons name="paper-plane-outline" size={26} color="#374151" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity>
                <Ionicons name="bookmark-outline" size={26} color="#374151" />
              </TouchableOpacity>
            </View>

            {showReactionPicker && (
              <View style={tw`absolute left-4 top-12 bg-white rounded-full px-3 py-2 flex-row items-center shadow-lg border border-gray-200 z-10`}>
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

            <Text style={tw`font-bold text-gray-900 mb-2 text-base`}>
              {post.likes} {post.likes === 1 ? 'like' : 'likes'}
            </Text>

            <View style={tw`mb-2 flex-row flex-wrap`}>
              <TouchableOpacity onPress={navigateToProfile}>
                <Text style={tw`font-bold text-gray-900 text-base`}>{post.username}</Text>
              </TouchableOpacity>
              <Text style={tw`text-gray-900 text-base`}> {post.caption}</Text>
            </View>

            <CO2Calculator category={post.category} activityType="post" />

            {post.daysUntilDecay !== undefined && (
              <View style={tw`flex-row items-center mt-2`}>
                <Ionicons name="time" size={16} color={post.daysUntilDecay <= 1 ? '#EF4444' : '#F59E0B'} />
                <Text
                  style={tw`text-sm font-semibold ml-1 ${
                    post.daysUntilDecay <= 1 ? 'text-red-600' : 'text-orange-600'
                  }`}
                >
                  {post.daysUntilDecay} day{post.daysUntilDecay !== 1 ? 's' : ''} left
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={() => setShowComments(true)} style={tw`mt-2`}>
              <Text style={tw`text-gray-500 text-sm`}>
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
            postCaption={post.caption}
            onClose={() => setShowComments(false)}
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}
