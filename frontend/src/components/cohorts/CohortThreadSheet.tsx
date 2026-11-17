import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import { listCohortReplies, replyToCohortPost, type CohortPost, type CohortReply } from '../../services/api/cohorts';
import { ApiError } from '../../services/api/http';
import { alertMessage } from '../../utils/confirmDialog';
import { haptic } from '../../theme/haptics';
import { COHORT_LIMITS, personName, shortAgo } from './cohortCopy';

type Props = {
  visible: boolean;
  onClose: () => void;
  cohortId: string;
  post: CohortPost | null;
  canReply: boolean;
  onReplied: (postId: string, reply: CohortReply) => void;
};

/** One-level reply thread under a coach update, composer pinned above the keyboard. */
export default function CohortThreadSheet({ visible, onClose, cohortId, post, canReply, onReplied }: Props) {
  const [replies, setReplies] = useState<CohortReply[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !post) return;
    let alive = true;
    setReplies(null);
    setText('');
    listCohortReplies(cohortId, post.id)
      .then((r) => alive && setReplies(r))
      .catch(() => alive && setReplies(post.replies));
    return () => {
      alive = false;
    };
  }, [visible, post, cohortId]);

  const send = async () => {
    const body = text.trim();
    if (!post || !body || busy) return;
    setBusy(true);
    try {
      const r = await replyToCohortPost(cohortId, post.id, body);
      haptic('success');
      setReplies((list) => [...(list ?? []), r]);
      setText('');
      onReplied(post.id, r);
    } catch (e) {
      void alertMessage('Couldn’t send that', e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatedBottomSheet visible={visible} onClose={onClose} keyboardAware maxHeightRatio={0.85}>
      <View style={tw`px-gutter pt-1 pb-4`}>
        {post ? (
          <View style={tw`flex-row items-start pb-3 border-b border-line`}>
            <GrowAvatar userId={post.author.id} username={post.author.username} uri={post.author.avatar_url} size={32} />
            <View style={tw`flex-1 ml-2.5`}>
              <Text style={tw`text-footnote font-semibold text-ink`}>{personName(post.author)}</Text>
              <Text style={tw`text-body text-ink mt-0.5`} numberOfLines={4}>
                {post.body}
              </Text>
            </View>
          </View>
        ) : null}
        <ScrollView style={tw`max-h-96`} contentContainerStyle={tw`py-3 gap-3`} keyboardShouldPersistTaps="handled">
          {replies === null ? (
            <ActivityIndicator color={theme.colors.brand} style={tw`my-4`} />
          ) : replies.length === 0 ? (
            <Text style={tw`text-footnote text-ink-3 text-center my-4`}>No replies yet — say hi.</Text>
          ) : (
            replies.map((r) => (
              <View key={r.id} style={tw`flex-row items-start`}>
                <GrowAvatar userId={r.author.id} username={r.author.username} uri={r.author.avatar_url} size={26} />
                <View style={tw`flex-1 ml-2.5 bg-raised rounded-card px-3 py-2`}>
                  <Text style={tw`text-footnote font-semibold text-ink`}>
                    {personName(r.author)} <Text style={tw`font-normal text-ink-3`}>· {shortAgo(r.created_at)}</Text>
                  </Text>
                  <Text style={tw`text-body text-ink mt-0.5`}>{r.body}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
        {canReply ? (
          <View style={tw`flex-row items-end gap-2 pt-2 border-t border-line`}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Reply to the group"
              placeholderTextColor={theme.colors.placeholder}
              multiline
              maxLength={COHORT_LIMITS.reply}
              accessibilityLabel="Reply"
              style={tw`flex-1 bg-raised rounded-control px-3 py-2.5 text-body text-ink max-h-28`}
            />
            <PressableScale
              feedback="send"
              disabled={!text.trim() || busy}
              onPress={() => void send()}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              style={tw`w-10 h-10 rounded-full bg-emerald-600 items-center justify-center ${
                !text.trim() || busy ? 'opacity-50' : ''
              }`}
            >
              <Ionicons name="arrow-up" size={20} color="#fff" />
            </PressableScale>
          </View>
        ) : null}
      </View>
    </AnimatedBottomSheet>
  );
}
