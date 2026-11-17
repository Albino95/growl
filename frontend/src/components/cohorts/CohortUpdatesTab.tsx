import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import GrowImage from '../ui/GrowImage';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/SkeletonCard';
import {
  deleteCohortPost,
  heartCohortPost,
  listCohortPosts,
  type Cohort,
  type CohortPost,
  type CohortReply,
} from '../../services/api/cohorts';
import { useRefresh } from '../../hooks/useRefresh';
import { confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import CohortPostComposer from './CohortPostComposer';
import CohortThreadSheet from './CohortThreadSheet';
import { personName, shortAgo } from './cohortCopy';

type Props = { cohort: Cohort };

function PostCard({
  post,
  isCoach,
  onHeart,
  onOpen,
  onDelete,
}: {
  post: CohortPost;
  isCoach: boolean;
  onHeart: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={tw`bg-card border border-line rounded-card px-4 py-3.5`}>
      <View style={tw`flex-row items-center`}>
        <GrowAvatar userId={post.author.id} username={post.author.username} uri={post.author.avatar_url} size={32} />
        <View style={tw`flex-1 ml-2.5`}>
          <Text style={tw`text-footnote font-semibold text-ink`}>{personName(post.author)}</Text>
          <Text style={tw`text-caption text-ink-3`}>Coach · {shortAgo(post.created_at)}</Text>
        </View>
        {isCoach ? (
          <PressableScale
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Remove update"
            hitSlop={8}
            style={tw`p-1`}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.iconMuted} />
          </PressableScale>
        ) : null}
      </View>
      <Text style={tw`text-body text-ink mt-2.5 leading-6`}>{post.body}</Text>
      {post.media_url ? (
        <GrowImage
          source={{ uri: post.media_url }}
          style={tw`w-full h-52 rounded-control mt-3`}
          contentFit="cover"
          accessibilityLabel="Photo in the update"
        />
      ) : null}
      <View style={tw`flex-row items-center mt-3 gap-4`}>
        <PressableScale
          feedback={post.hearted_by_me ? 'unlike' : 'like'}
          onPress={onHeart}
          accessibilityRole="button"
          accessibilityState={{ selected: post.hearted_by_me }}
          accessibilityLabel={`${post.hearted_by_me ? 'Remove heart' : 'Heart'}. ${post.hearts} hearts`}
          style={tw`flex-row items-center`}
        >
          <Ionicons
            name={post.hearted_by_me ? 'heart' : 'heart-outline'}
            size={20}
            color={post.hearted_by_me ? theme.colors.energy : theme.colors.icon}
          />
          <Text style={tw`ml-1 text-footnote text-ink-2`}>{post.hearts || ''}</Text>
        </PressableScale>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Replies, ${post.reply_count}`}
          style={tw`flex-row items-center`}
        >
          <Ionicons name="chatbubble-outline" size={18} color={theme.colors.icon} />
          <Text style={tw`ml-1 text-footnote text-ink-2`}>
            {post.reply_count ? `${post.reply_count} ${post.reply_count === 1 ? 'reply' : 'replies'}` : 'Reply'}
          </Text>
        </PressableScale>
      </View>
      {post.replies.length ? (
        <PressableScale onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open replies" style={tw`mt-2.5 gap-1.5`}>
          {post.replies.map((r) => (
            <Text key={r.id} style={tw`text-footnote text-ink-2`} numberOfLines={2}>
              <Text style={tw`font-semibold text-ink`}>{personName(r.author)}</Text> {r.body}
            </Text>
          ))}
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Group updates feed: coach broadcasts, members ❤️ and reply (one level). */
export default function CohortUpdatesTab({ cohort }: Props) {
  const isCoach = cohort.role === 'coach';
  const [posts, setPosts] = useState<CohortPost[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composer, setComposer] = useState(false);
  const [thread, setThread] = useState<CohortPost | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listCohortPosts(cohort.id);
      setPosts(r.posts);
      setCursor(r.next_cursor);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [cohort.id]);

  useEffect(() => {
    void load();
  }, [load]);
  const refresh = useRefresh(load);

  const more = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await listCohortPosts(cohort.id, cursor);
      setPosts((p) => [...(p ?? []), ...r.posts]);
      setCursor(r.next_cursor);
    } catch {
      toast.info('Couldn’t load more just now');
    } finally {
      setLoadingMore(false);
    }
  };

  const patch = (id: string, fn: (p: CohortPost) => CohortPost) =>
    setPosts((list) => (list ?? []).map((p) => (p.id === id ? fn(p) : p)));

  const heart = async (p: CohortPost) => {
    const on = !p.hearted_by_me;
    patch(p.id, (x) => ({ ...x, hearted_by_me: on, hearts: Math.max(0, x.hearts + (on ? 1 : -1)) }));
    try {
      const r = await heartCohortPost(cohort.id, p.id);
      patch(p.id, (x) => ({ ...x, hearted_by_me: r.hearted_by_me, hearts: r.hearts }));
    } catch {
      patch(p.id, (x) => ({ ...x, hearted_by_me: p.hearted_by_me, hearts: p.hearts }));
    }
  };

  const remove = async (p: CohortPost) => {
    const ok = await confirmAsync('Remove this update?', 'Replies and hearts go with it.', {
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCohortPost(cohort.id, p.id);
      setPosts((list) => (list ?? []).filter((x) => x.id !== p.id));
      haptic('success');
    } catch {
      toast.info('Couldn’t remove it just now');
    }
  };

  const onReplied = (postId: string, r: CohortReply) =>
    patch(postId, (x) => ({ ...x, reply_count: x.reply_count + 1, replies: [...x.replies, r].slice(-3) }));

  const canWrite = cohort.status === 'active';

  return (
    <>
      <ScrollView
        contentContainerStyle={tw`px-gutter pt-3 pb-16 gap-3`}
        refreshControl={<RefreshControl {...refresh} />}
      >
        {isCoach && canWrite ? (
          <PressableScale
            feedback="open"
            onPress={() => setComposer(true)}
            accessibilityRole="button"
            accessibilityLabel="Post an update to the group"
            style={tw`flex-row items-center bg-card border border-line rounded-card px-4 py-3`}
          >
            <Ionicons name="megaphone-outline" size={20} color={theme.colors.brand} />
            <Text style={tw`ml-2.5 flex-1 text-body text-ink-3`}>Post an update to everyone…</Text>
          </PressableScale>
        ) : null}

        {posts === null && !failed ? (
          <SkeletonList variant="post" count={2} />
        ) : posts === null ? (
          <ErrorState compact title="Updates are still loading" message="We couldn’t reach them just now." onRetry={() => void load()} />
        ) : posts.length === 0 ? (
          <EmptyState
            icon="megaphone-outline"
            title={isCoach ? 'Say hello to your group' : 'No updates yet'}
            description={
              isCoach
                ? 'Your first update reaches every member at once — a welcome, the plan for week 1, or a tip.'
                : 'Your coach’s updates show up here.'
            }
          />
        ) : (
          posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isCoach={isCoach}
              onHeart={() => void heart(p)}
              onOpen={() => setThread(p)}
              onDelete={() => void remove(p)}
            />
          ))
        )}
        {cursor ? (
          <PressableScale
            onPress={() => void more()}
            disabled={loadingMore}
            accessibilityRole="button"
            style={tw`py-3 items-center ${loadingMore ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-footnote font-semibold text-emerald-700`}>Older updates</Text>
          </PressableScale>
        ) : null}
      </ScrollView>

      <CohortPostComposer
        visible={composer}
        onClose={() => setComposer(false)}
        cohortId={cohort.id}
        memberCount={cohort.member_count}
        onPosted={(p) => {
          setComposer(false);
          setPosts((list) => [p, ...(list ?? [])]);
          toast.success('Update posted');
        }}
      />
      <CohortThreadSheet
        visible={!!thread}
        onClose={() => setThread(null)}
        cohortId={cohort.id}
        post={thread}
        canReply={canWrite}
        onReplied={onReplied}
      />
    </>
  );
}
