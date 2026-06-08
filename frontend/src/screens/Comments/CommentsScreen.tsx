import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import tw from '../../lib/tw';
import { verticalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import {
  getFeedPostComments,
  createFeedPostComment,
  type FeedComment,
} from '../../services/api/feed';
import { resolveAvatarUri } from '../../utils/images';

function formatCommentTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffM / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffM < 1) return 'now';
  if (diffM < 60) return `${diffM}m`;
  if (diffH < 48) return `${diffH}h`;
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString();
}

interface CommentsScreenProps {
  postId: string;
  postUsername: string;
  postCaption: string;
  onClose: () => void;
  onCommentsChanged?: (count: number) => void;
}

export default function CommentsScreen({
  postId,
  postUsername,
  postCaption,
  onClose,
  onCommentsChanged,
}: CommentsScreenProps) {
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [failedCommentDraft, setFailedCommentDraft] = useState('');
  const { user } = useAuth();
  const navigation = useNavigation();

  const loadComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getFeedPostComments(postId);
      setComments(list);
    } catch {
      setComments([]);
      setLoadError('Could not load comments. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const submitComment = async (text: string) => {
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await createFeedPostComment(postId, text);
      setCommentText('');
      setFailedCommentDraft('');
      const list = await getFeedPostComments(postId);
      setComments(list);
      onCommentsChanged?.(list.length);
    } catch {
      setFailedCommentDraft(text);
      setSendError('Failed to send comment. Please retry.');
    } finally {
      setSending(false);
    }
  };

  const handleSendComment = async () => {
    const text = commentText.trim();
    await submitComment(text);
  };

  const retrySendComment = async () => {
    if (!failedCommentDraft) return;
    setCommentText(failedCommentDraft);
    await submitComment(failedCommentDraft);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-100 bg-white`}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-gray-900`}>Comments</Text>
          <View style={tw`w-7`} />
        </View>

        <View style={tw`px-4 py-3 border-b border-gray-100 bg-gray-50`}>
          <View style={tw`flex-row items-start`}>
            <View style={tw`w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3`}>
              <Text style={tw`text-xs font-bold text-green-800`}>
                {(postUsername || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-gray-900 mb-1`}>{postUsername}</Text>
              <Text style={tw`text-sm text-gray-700`}>{postCaption}</Text>
            </View>
          </View>
        </View>

        {!loading && loadError && (
          <View style={tw`mx-4 mt-3 mb-1 px-3 py-3 rounded-xl border border-red-200 bg-red-50`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
              <Text style={tw`ml-2 flex-1 text-sm text-red-800`}>{loadError}</Text>
              <TouchableOpacity onPress={() => void loadComments()} style={tw`ml-2 px-3 py-1.5 rounded-full bg-red-600`}>
                <Text style={tw`text-xs font-semibold text-white`}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? (
          <View style={tw`flex-1 items-center justify-center py-16`}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`px-4 py-3 pb-6`}
            {...verticalScrollProps}
            {...feedListPerformanceProps}
            renderItem={({ item }) => {
              const uname = item.user?.username || 'Member';
              const avatarUri = resolveAvatarUri(item.user_id, uname, item.user?.avatar ?? '');
              return (
                <View style={tw`flex-row items-start mb-4`}>
                  <TouchableOpacity
                    onPress={() => {
                      if (item.user_id !== user?.id) {
                        const rootNavigation = navigation.getParent() || navigation;
                        rootNavigation.navigate('PublicProfile' as never, { userId: item.user_id } as never);
                      }
                    }}
                  >
                    <Image source={{ uri: avatarUri }} style={tw`w-8 h-8 rounded-full mr-3 bg-stone-200`} contentFit="cover" />
                  </TouchableOpacity>
                  <View style={tw`flex-1`}>
                    <View style={tw`bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 mb-1`}>
                      <TouchableOpacity
                        onPress={() => {
                          if (item.user_id !== user?.id) {
                            const rootNavigation = navigation.getParent() || navigation;
                            rootNavigation.navigate('PublicProfile' as never, { userId: item.user_id } as never);
                          }
                        }}
                      >
                        <Text style={tw`text-sm font-semibold text-gray-900 mb-0.5`}>{uname}</Text>
                      </TouchableOpacity>
                      <Text style={tw`text-sm text-gray-800`}>{item.content}</Text>
                    </View>
                    <Text style={tw`text-xs text-gray-500 ml-2`}>{formatCommentTime(item.created_at)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={tw`items-center justify-center py-12`}>
                <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
                <Text style={tw`text-gray-500 mt-4 text-center`}>No comments yet. Be the first to comment!</Text>
              </View>
            }
          />
        )}

        <View style={tw`border-t border-gray-200 bg-white px-4 py-3`}>
          {sendError && (
            <View style={tw`mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2`}>
              <View style={tw`flex-row items-center`}>
                <Text style={tw`flex-1 text-xs text-red-700`}>{sendError}</Text>
                <TouchableOpacity onPress={() => void retrySendComment()} disabled={sending || !failedCommentDraft}>
                  <Text style={tw`text-xs font-semibold text-red-800`}>Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
                editable={!sending}
              />
            </View>
            {commentText.trim() ? (
              <TouchableOpacity
                onPress={() => void handleSendComment()}
                disabled={sending}
                style={tw`bg-green-500 rounded-full w-10 h-10 items-center justify-center ${sending ? 'opacity-50' : ''}`}
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
              </TouchableOpacity>
            ) : (
              <View style={tw`w-10 h-10 items-center justify-center`}>
                <Ionicons name="camera-outline" size={22} color="#D1D5DB" />
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
