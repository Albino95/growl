import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { verticalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import {
  getFeedPostComments,
  createFeedPostComment,
  deleteFeedPostComment,
  COMMENT_PAGE_SIZE,
  COMMENT_MAX_LENGTH,
  type FeedComment,
} from '../../services/api/feed';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { uuidV4 } from '../../services/api/idempotency';
import { resolveAvatarUri, avatarSource } from '../../utils/images';
import { formInputAccessoryProps } from '../../components/ui/KeyboardDoneAccessory';
import { SkeletonList } from '../../components/ui/SkeletonCard';
import FadeInUp from '../../components/ui/FadeInUp';
import { feedback } from '../../utils/interactionFeedback';
import { haptic } from '../../theme/haptics';

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
  /** Post author's id — lets them remove comments on their post. */
  postUserId?: string;
}

/** SQLite `YYYY-MM-DD HH:MM:SS` (UTC) or ISO → epoch ms. */
function commentTime(raw: string): number {
  const v = String(raw || '').trim();
  const iso = /T/.test(v) ? v : `${v.replace(' ', 'T')}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** A comment row; local (optimistic) rows carry `pending` / `failed`. */
type CommentRow = FeedComment & { pending?: boolean; failed?: boolean };

const isLocalComment = (c: CommentRow) => c.id.startsWith('tmp-');

/** Dedupes by id and keeps chronological order (oldest first); stable for equal times. */
function mergeComments(a: CommentRow[], b: CommentRow[]): CommentRow[] {
  const byId = new Map<string, CommentRow>();
  for (const c of [...a, ...b]) byId.set(c.id, c);
  return Array.from(byId.values()).sort((x, y) => commentTime(x.created_at) - commentTime(y.created_at));
}

export default function CommentsScreen({
  postId,
  postUsername,
  postCaption,
  onClose,
  onCommentsChanged,
  postUserId,
}: CommentsScreenProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigation = useNavigation();
  const listRef = useRef<FlatList<CommentRow>>(null);
  /** Temp ids whose send is in flight — guards double retries. */
  const sendingIdsRef = useRef<Set<string>>(new Set());
  /** Auto-load of older comments only after the user has actually scrolled. */
  const userScrolledRef = useRef(false);
  /**
   * Comments is always shown inside a pageSheet Modal (Feed, Reels, PostDetail).
   * KeyboardAvoidingView compares its *local* frame with the keyboard's *screen*
   * Y, so the offset must be this view's distance from the top of the window
   * (sheet inset + header). Measured, not hardcoded, so it's right on every device.
   */
  const kavWrapRef = useRef<View>(null);
  const [kbOffset, setKbOffset] = useState(0);
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureKbOffset = useCallback(() => {
    const measure = () =>
      kavWrapRef.current?.measureInWindow((_x, y) => {
        if (Number.isFinite(y)) setKbOffset(Math.max(0, Math.round(y)));
      });
    measure();
    // First layout can land mid sheet-slide; settle once the presentation finishes.
    if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
    measureTimerRef.current = setTimeout(measure, 450);
  }, []);
  useEffect(
    () => () => {
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
    },
    []
  );

  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Post author can moderate their thread; fall back to username match when the
  // caller didn't pass the author id.
  const isPostAuthor = postUserId
    ? !!user?.id && postUserId === user.id
    : !!user?.username && user.username === postUsername;

  // Set after a local add/delete; the effect below then reports the new count.
  const countDirtyRef = useRef(false);
  useEffect(() => {
    if (!countDirtyRef.current) return;
    countDirtyRef.current = false;
    // Only report when every comment is loaded, otherwise it would undercount.
    if (!hasOlder) onCommentsChanged?.(comments.filter((c) => !isLocalComment(c)).length);
  }, [comments, hasOlder, onCommentsChanged]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getFeedPostComments(postId);
      // Keep local (pending / failed) rows across a reload.
      setComments((prev) => mergeComments(list, prev.filter(isLocalComment)));
      setHasOlder(list.length >= COMMENT_PAGE_SIZE);
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

  const loadOlderComments = async () => {
    const oldest = comments.find((c) => !isLocalComment(c));
    if (!oldest || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getFeedPostComments(postId, oldest);
      setComments((prev) => mergeComments(page, prev));
      setHasOlder(page.length >= COMMENT_PAGE_SIZE);
    } catch {
      void alertMessage('Comments', 'Could not load earlier comments.');
    } finally {
      setLoadingOlder(false);
    }
  };

  /**
   * Optimistic send: a `tmp-…` row appears at once (dimmed), then is swapped for
   * the server row. On failure the row stays, marked "Couldn't send · Tap to retry".
   */
  const submitComment = async (text: string, retryId?: string) => {
    if (!text) return;
    // The temp id doubles as the Idempotency-Key (valid: [A-Za-z0-9_\-:.]{8,128}),
    // so "Tap to retry" re-sends the same key and can never post twice.
    const tempId = retryId || `tmp-${uuidV4()}`;
    if (sendingIdsRef.current.has(tempId)) return;
    sendingIdsRef.current.add(tempId);
    if (retryId) {
      setComments((prev) =>
        prev.map((c) => (c.id === retryId ? { ...c, pending: true, failed: false } : c))
      );
    } else {
      const temp: CommentRow = {
        id: tempId,
        post_id: postId,
        user_id: user?.id ?? '',
        content: text,
        created_at: new Date().toISOString(),
        user: {
          id: user?.id ?? '',
          username: user?.username,
          avatar: user?.avatar ?? null,
        },
        pending: true,
      };
      setComments((prev) => mergeComments(prev, [temp]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
    let created: FeedComment;
    try {
      created = await createFeedPostComment(postId, text, { idempotencyKey: tempId });
    } catch {
      sendingIdsRef.current.delete(tempId);
      feedback.error();
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? { ...c, pending: false, failed: true } : c))
      );
      return;
    }
    sendingIdsRef.current.delete(tempId);
    countDirtyRef.current = true;
    setComments((prev) => mergeComments(prev.filter((c) => c.id !== tempId), [created]));
    // Best-effort refresh for other people's new comments; failures are silent.
    try {
      const latest = await getFeedPostComments(postId);
      countDirtyRef.current = true;
      setComments((prev) => mergeComments(prev, latest));
    } catch {
      /* keep optimistic list */
    }
  };

  const deleteComment = async (comment: FeedComment) => {
    if (deletingId) return;
    const ok = await confirmAsync('Delete comment?', 'This removes the comment for everyone.', {
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(comment.id);
    try {
      await deleteFeedPostComment(postId, comment.id);
      countDirtyRef.current = true;
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (e) {
      void alertMessage('Comments', e instanceof Error ? e.message : 'Could not delete comment.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendComment = () => {
    const text = commentText.trim();
    if (!text) return;
    feedback.send();
    // Clear instantly — the text lives on in the optimistic row (and its retry).
    setCommentText('');
    void submitComment(text);
  };

  const retrySendComment = (row: CommentRow) => {
    if (!row.failed) return;
    haptic('tapLight');
    void submitComment(row.content, row.id);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      <View ref={kavWrapRef} style={tw`flex-1`} onLayout={measureKbOffset} collapsable={false}>
      <FadeInUp distance={10} style={tw`flex-1`}>
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? kbOffset : 0}
        >
          <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line/80 bg-card`}>
            <PressableScale
              pressedScale={0.9}
              onPress={() => {
                feedback.close();
                onClose();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close comments"
            >
              <Ionicons name="close" size={28} color={theme.colors.ink2} />
            </PressableScale>
            <Text style={tw`text-callout font-semibold text-ink`}>Comments</Text>
            <View style={tw`w-7`} />
          </View>

          <View style={tw`px-gutter py-3 border-b border-line/60 bg-raised/70`}>
            <View style={tw`flex-row items-start`}>
              <View style={tw`w-8 h-8 rounded-full bg-emerald-100 items-center justify-center mr-3`}>
                <Text style={tw`text-xs font-bold text-emerald-800`}>
                  {(postUsername || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-semibold text-ink mb-1`}>{postUsername}</Text>
                <Text style={tw`text-sm text-ink-2`}>{postCaption}</Text>
              </View>
            </View>
          </View>

          {!loading && loadError && (
            <View style={tw`mx-4 mt-3 mb-1 px-3 py-3 rounded-control border border-red-200 bg-red-50`}>
              <View style={tw`flex-row items-center`}>
                <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                <Text style={tw`ml-2 flex-1 text-sm text-red-800`}>{loadError}</Text>
                <PressableScale
                  onPress={() => void loadComments()}
                  style={tw`ml-2 px-3 py-1.5 rounded-chip bg-[#DC2626]`}
                >
                  <Text style={tw`text-xs font-semibold text-white`}>Retry</Text>
                </PressableScale>
              </View>
            </View>
          )}

          {loading ? (
            <View style={tw`flex-1 px-gutter pt-4`}>
              <SkeletonList variant="comment" count={5} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={tw`px-gutter py-3 pb-6`}
              {...verticalScrollProps}
              {...feedListPerformanceProps}
              // Older pages prepend; keep the reader's place and auto-load near the top.
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onScrollBeginDrag={() => {
                userScrolledRef.current = true;
              }}
              onStartReachedThreshold={0.5}
              onStartReached={() => {
                if (userScrolledRef.current) void loadOlderComments();
              }}
              ListHeaderComponent={
                hasOlder ? (
                  <PressableScale
                    onPress={() => void loadOlderComments()}
                    disabled={loadingOlder}
                    style={tw`self-center mb-3 px-4 py-2 rounded-chip bg-raised`}
                    accessibilityRole="button"
                    accessibilityLabel="Load earlier comments"
                  >
                    {loadingOlder ? (
                      <ActivityIndicator size="small" color={theme.colors.ink3} />
                    ) : (
                      <Text style={tw`text-xs font-semibold text-ink-2`}>
                        Load earlier comments
                      </Text>
                    )}
                  </PressableScale>
                ) : null
              }
              renderItem={({ item }) => {
                const uname = item.user?.username || 'Member';
                const local = isLocalComment(item);
                const canDelete = !local && ((!!user?.id && item.user_id === user.id) || isPostAuthor);
                const avatarUri = resolveAvatarUri(item.user_id, uname, item.user?.avatar ?? '');
                return (
                  <View
                    style={[tw`flex-row items-start mb-4`, item.pending ? { opacity: 0.6 } : null]}
                    accessibilityState={{ busy: !!item.pending }}
                  >
                    <PressableScale
                      pressedScale={0.9}
                      onPress={() => {
                        if (item.user_id !== user?.id) {
                          const rootNavigation = navigation.getParent() || navigation;
                          rootNavigation.dispatch(CommonActions.navigate('PublicProfile', { userId: item.user_id, preview: { username: item.user?.username, avatarUrl: item.user?.avatar } }));
                        }
                      }}
                    >
                      <Image
                        source={avatarSource(avatarUri)}
                        style={tw`w-8 h-8 rounded-full mr-3 bg-stone-200`}
                        contentFit="cover"
                      />
                    </PressableScale>
                    <View style={tw`flex-1`}>
                      <View style={tw`bg-card border border-line/80 rounded-card rounded-tl-sm px-3 py-2 mb-1`}>
                        <PressableScale
                          onPress={() => {
                            if (item.user_id !== user?.id) {
                              const rootNavigation = navigation.getParent() || navigation;
                              rootNavigation.dispatch(CommonActions.navigate('PublicProfile', { userId: item.user_id, preview: { username: item.user?.username, avatarUrl: item.user?.avatar } }));
                            }
                          }}
                        >
                          <Text style={tw`text-sm font-semibold text-ink mb-0.5`}>{uname}</Text>
                        </PressableScale>
                        <Text style={tw`text-sm text-ink`}>{item.content}</Text>
                      </View>
                      {item.failed ? (
                        <PressableScale
                          onPress={() => retrySendComment(item)}
                          style={tw`flex-row items-center ml-2`}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel="Couldn't send. Tap to retry"
                        >
                          <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
                          <Text style={tw`ml-1 text-xs font-semibold text-red-700`}>
                            Couldn’t send · Tap to retry
                          </Text>
                        </PressableScale>
                      ) : (
                      <View style={tw`flex-row items-center ml-2`}>
                        <Text style={tw`text-xs text-ink-3`}>
                          {item.pending ? 'Sending…' : formatCommentTime(item.created_at)}
                        </Text>
                        {canDelete ? (
                          <PressableScale
                            onPress={() => void deleteComment(item)}
                            disabled={deletingId === item.id}
                            style={tw`ml-3`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel="Delete comment"
                          >
                            {deletingId === item.id ? (
                              <ActivityIndicator size="small" color={theme.colors.iconMuted} />
                            ) : (
                              <Text style={tw`text-xs font-semibold text-ink-3`}>Delete</Text>
                            )}
                          </PressableScale>
                        ) : null}
                      </View>
                      )}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={tw`items-center justify-center py-12`}>
                  <Ionicons name="chatbubbles-outline" size={64} color={theme.colors.iconMuted} />
                  <Text style={tw`text-ink-3 mt-4 text-center`}>
                    No comments yet. Be the first to comment!
                  </Text>
                </View>
              }
            />
          )}

          <View style={tw`border-t border-line/80 bg-card px-gutter py-3`}>
            <View style={tw`flex-row items-end`}>
              <View style={tw`flex-1 bg-raised rounded-chip px-4 py-2 max-h-24 mr-2`}>
                <TextInput
                  {...formInputAccessoryProps({ multiline: true })}
                  placeholder="Add a comment..."
                  value={commentText}
                  onChangeText={setCommentText}
                  maxLength={COMMENT_MAX_LENGTH}
                  multiline
                  // Comments are short: Return sends (and keeps the keyboard up), the
                  // field still grows/wraps for long text.
                  returnKeyType="send"
                  submitBehavior="submit"
                  onSubmitEditing={handleSendComment}
                  style={tw`text-sm text-ink`}
                  placeholderTextColor={theme.colors.placeholder}
                />
              </View>
              {commentText.trim() ? (
                <PressableScale
                  hitSlop={4}
                  pressedScale={0.9}
                  onPress={handleSendComment}
                  style={tw`bg-emerald-600 rounded-full w-10 h-10 items-center justify-center`}
                  accessibilityRole="button"
                  accessibilityLabel="Send comment"
                >
                  <Ionicons name="send" size={18} color="#FFFFFF" />
                </PressableScale>
              ) : (
                <View style={tw`w-10 h-10 items-center justify-center`}>
                  <Ionicons name="camera-outline" size={22} color={theme.colors.iconMuted} />
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </FadeInUp>
      </View>
    </SafeAreaView>
  );
}
