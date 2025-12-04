import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, KeyboardAvoidingView, Platform, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAuthStore } from '../../state/useAuthStore';
import CommentsScreen from '../Comments/CommentsScreen';
import CO2Calculator from '../../components/ui/CO2Calculator';
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
  timestamp: string;
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
  const { user } = useAuthStore();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'PostDetail'>>();
  const { post: initialPost } = route.params;
  
  const [post, setPost] = useState<Post>(initialPost);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  const toggleLike = () => {
    setPost((prev) => ({
      ...prev,
      hasLiked: !prev.hasLiked,
      likes: prev.hasLiked ? prev.likes - 1 : prev.likes + 1,
      reaction: prev.hasLiked ? null : 'like',
    }));
  };

  const setReaction = (reaction: ReactionType) => {
    const wasLiked = post.hasLiked || post.reaction !== null;
    const willBeLiked = reaction !== null;
    
    setPost((prev) => ({
      ...prev,
      reaction,
      hasLiked: willBeLiked,
      likes: wasLiked && !willBeLiked ? prev.likes - 1 : !wasLiked && willBeLiked ? prev.likes + 1 : prev.likes,
    }));
    setShowReactionPicker(false);
  };

  const getReactionIcon = (reaction: ReactionType) => {
    switch (reaction) {
      case 'like':
        return '👍';
      case 'love':
        return '❤️';
      case 'laugh':
        return '😂';
      case 'wow':
        return '😮';
      case 'support':
        return '💪';
      default:
        return null;
    }
  };

  const navigateToProfile = () => {
    const rootNavigation = navigation.getParent() || navigation;
    rootNavigation.navigate('PublicProfile' as never, { userId: post.userId } as never);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
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
          {/* Post Header - User Info */}
          <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-100`}>
            <TouchableOpacity
              style={tw`flex-row items-center flex-1`}
              onPress={navigateToProfile}
            >
              <View style={tw`w-12 h-12 rounded-full bg-green-500 items-center justify-center mr-3 shadow-sm`}>
                <Text style={tw`text-2xl`}>{post.avatar}</Text>
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`font-bold text-gray-900 text-base`}>{post.username}</Text>
                <Text style={tw`text-xs text-gray-500`}>
                  {post.timestamp || (post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '')}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={tw`p-1`}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Post Image/Content - Full Width */}
          <View style={tw`w-full bg-gray-50`}>
            <View style={tw`w-full h-96 bg-gray-100 items-center justify-center`}>
              <Text style={tw`text-8xl`}>{post.image}</Text>
            </View>
          </View>

          {/* Post Actions */}
          <View style={tw`px-4 py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <View style={tw`flex-row items-center`}>
                <TouchableOpacity
                  onPress={toggleLike}
                  onLongPress={() => setShowReactionPicker(!showReactionPicker)}
                  style={tw`mr-3`}
                >
                  {post.reaction ? (
                    <View style={tw`flex-row items-center`}>
                      <Text style={tw`text-2xl mr-1`}>{getReactionIcon(post.reaction)}</Text>
                      <Ionicons name="heart" size={28} color="#EF4444" />
                    </View>
                  ) : (
                    <Ionicons
                      name={post.hasLiked ? 'heart' : 'heart-outline'}
                      size={28}
                      color={post.hasLiked ? '#EF4444' : '#374151'}
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowComments(true)}
                  style={tw`mr-3`}
                >
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

            {/* Reaction Picker */}
            {showReactionPicker && (
              <View style={tw`absolute left-4 top-12 bg-white rounded-full px-3 py-2 flex-row items-center shadow-lg border border-gray-200 z-10`}>
                <TouchableOpacity onPress={() => setReaction('like')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>👍</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReaction('love')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>❤️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReaction('laugh')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😂</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReaction('wow')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>😮</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setReaction('support')} style={tw`mx-1`}>
                  <Text style={tw`text-2xl`}>💪</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Likes Count */}
            <Text style={tw`font-bold text-gray-900 mb-2 text-base`}>
              {post.likes} {post.likes === 1 ? 'like' : 'likes'}
              {post.reaction && post.reaction !== 'like' && (
                <Text style={tw`text-gray-600 font-normal`}> • {getReactionIcon(post.reaction)}</Text>
              )}
            </Text>

            {/* Caption */}
            <View style={tw`mb-2 flex-row flex-wrap`}>
              <TouchableOpacity onPress={navigateToProfile}>
                <Text style={tw`font-bold text-gray-900 text-base`}>{post.username}</Text>
              </TouchableOpacity>
              <Text style={tw`text-gray-900 text-base`}> {post.caption}</Text>
            </View>

            {/* CO2 Calculator */}
            <CO2Calculator category={post.category} activityType="post" />

            {/* Decay Timer (if available) */}
            {post.daysUntilDecay !== undefined && (
              <View style={tw`flex-row items-center mt-2`}>
                <Ionicons name="time" size={16} color={post.daysUntilDecay <= 1 ? '#EF4444' : '#F59E0B'} />
                <Text style={tw`text-sm font-semibold ml-1 ${
                  post.daysUntilDecay <= 1 ? 'text-red-600' : 'text-orange-600'
                }`}>
                  {post.daysUntilDecay} day{post.daysUntilDecay !== 1 ? 's' : ''} left
                </Text>
              </View>
            )}

            {/* View Comments Link */}
            {post.comments > 0 && (
              <TouchableOpacity onPress={() => setShowComments(true)} style={tw`mt-2`}>
                <Text style={tw`text-gray-500 text-sm mb-1`}>
                  View all {post.comments} {post.comments === 1 ? 'comment' : 'comments'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Comments Modal */}
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

