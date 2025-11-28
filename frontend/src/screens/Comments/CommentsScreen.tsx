import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

type Comment = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  comment: string;
  timestamp: string;
  likes: number;
  hasLiked: boolean;
};

interface CommentsScreenProps {
  postId: string;
  postUsername: string;
  postCaption: string;
  onClose: () => void;
}

// Mock comments
const MOCK_COMMENTS: Comment[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'John',
    avatar: '👤',
    comment: 'Great progress! Keep it up!',
    timestamp: '2h',
    likes: 5,
    hasLiked: false,
  },
  {
    id: '2',
    userId: 'u2',
    username: 'Sarah',
    avatar: '👩',
    comment: 'This is so inspiring! 💪',
    timestamp: '5h',
    likes: 12,
    hasLiked: true,
  },
  {
    id: '3',
    userId: 'u3',
    username: 'Mike',
    avatar: '👨',
    comment: 'Amazing work!',
    timestamp: '1d',
    likes: 3,
    hasLiked: false,
  },
];

export default function CommentsScreen({ postId, postUsername, postCaption, onClose }: CommentsScreenProps) {
  const [comments, setComments] = useState<Comment[]>(MOCK_COMMENTS);
  const [commentText, setCommentText] = useState('');
  const { user } = useAuthStore();

  const handleSendComment = () => {
    if (!commentText.trim()) return;

    const newComment: Comment = {
      id: Date.now().toString(),
      userId: user?.id || 'me',
      username: 'You',
      avatar: '👋',
      comment: commentText.trim(),
      timestamp: 'now',
      likes: 0,
      hasLiked: false,
    };

    setComments([...comments, newComment]);
    setCommentText('');
  };

  const toggleLikeComment = (commentId: string) => {
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              hasLiked: !comment.hasLiked,
              likes: comment.hasLiked ? comment.likes - 1 : comment.likes + 1,
            }
          : comment
      )
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`} edges={['top']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white`}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-gray-900`}>Comments</Text>
          <View style={tw`w-7`} />
        </View>

        {/* Post Caption */}
        <View style={tw`px-4 py-3 border-b border-gray-100 bg-gray-50`}>
          <View style={tw`flex-row items-start`}>
            <View style={tw`w-8 h-8 rounded-full bg-gray-200 items-center justify-center mr-3`}>
              <Text style={tw`text-lg`}>👤</Text>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-gray-900 mb-1`}>{postUsername}</Text>
              <Text style={tw`text-sm text-gray-700`}>{postCaption}</Text>
            </View>
          </View>
        </View>

        {/* Comments List */}
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-4 py-3`}
          renderItem={({ item }) => (
            <View style={tw`flex-row items-start mb-4`}>
              <View style={tw`w-8 h-8 rounded-full bg-gray-200 items-center justify-center mr-3`}>
                <Text style={tw`text-lg`}>{item.avatar}</Text>
              </View>
              <View style={tw`flex-1`}>
                <View style={tw`bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 mb-1`}>
                  <Text style={tw`text-sm font-semibold text-gray-900 mb-0.5`}>{item.username}</Text>
                  <Text style={tw`text-sm text-gray-800`}>{item.comment}</Text>
                </View>
                <View style={tw`flex-row items-center ml-2`}>
                  <Text style={tw`text-xs text-gray-500 mr-4`}>{item.timestamp}</Text>
                  <TouchableOpacity onPress={() => toggleLikeComment(item.id)}>
                    <Text style={tw`text-xs font-semibold ${item.hasLiked ? 'text-red-500' : 'text-gray-500'}`}>
                      {item.likes > 0 ? `${item.likes} like${item.likes !== 1 ? 's' : ''}` : 'Like'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>No comments yet. Be the first to comment!</Text>
            </View>
          }
        />

        {/* Comment Input */}
        <View style={tw`border-t border-gray-200 bg-white px-4 py-3`}>
          <View style={tw`flex-row items-end`}>
            <View style={tw`flex-1 bg-gray-100 rounded-full px-4 py-2 max-h-24 mr-2`}>
              <TextInput
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
                style={tw`text-sm text-gray-900`}
                placeholderTextColor="#9CA3AF"
                returnKeyType="default"
              />
            </View>
            {commentText.trim() ? (
              <TouchableOpacity
                onPress={handleSendComment}
                style={tw`bg-green-500 rounded-full w-10 h-10 items-center justify-center`}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={tw`w-10 h-10 items-center justify-center`}>
                <Ionicons name="camera-outline" size={22} color="#10B981" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

