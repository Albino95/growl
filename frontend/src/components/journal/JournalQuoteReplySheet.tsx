import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import {
  createJournalReply,
  listJournalReplies,
  type CircleJournalEntry,
  type JournalReply,
} from '../../services/api/journal';
import { formInputAccessoryProps } from '../ui/KeyboardDoneAccessory';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import AnimatedBottomSheet from '../ui/AnimatedBottomSheet';
import { SkeletonList } from '../ui/SkeletonCard';

function splitSentences(content: string): string[] {
  const parts = content
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  return parts.length > 0 ? parts : [content.trim()].filter(Boolean);
}

type Props = {
  visible: boolean;
  entry: CircleJournalEntry | null;
  onClose: () => void;
  onPrivateReply: (entry: CircleJournalEntry, quote: string, body: string) => void;
};

/** Pick a sentence → reply in the circle thread or open a private DM. */
export default function JournalQuoteReplySheet({
  visible,
  entry,
  onClose,
  onPrivateReply,
}: Props) {
  const [quote, setQuote] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [replies, setReplies] = useState<JournalReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const sentences = useMemo(
    () => (entry ? splitSentences(entry.content) : []),
    [entry]
  );

  useEffect(() => {
    if (!visible || !entry) return;
    setQuote(null);
    setBody('');
    setLoading(true);
    listJournalReplies(entry.id)
      .then((res) => setReplies(res.data?.replies ?? []))
      .catch(() => setReplies([]))
      .finally(() => setLoading(false));
  }, [visible, entry?.id]);

  const submitPublic = async () => {
    if (!entry || !quote || !body.trim() || sending) return;
    setSending(true);
    feedback.send();
    try {
      const res = await createJournalReply(entry.id, {
        quote_text: quote,
        body: body.trim(),
        visibility: 'public',
      });
      if (res.data) {
        setReplies((prev) => [
          ...prev,
          {
            ...res.data,
            username: 'You',
          },
        ]);
      }
      setBody('');
      setQuote(null);
      feedback.success();
    } catch (e) {
      feedback.error();
      alertMessage('Reply failed', e instanceof Error ? e.message : 'Try again');
    } finally {
      setSending(false);
    }
  };

  const submitPrivate = async (close: () => void) => {
    if (!entry || !quote || !body.trim() || sending) return;
    setSending(true);
    feedback.send();
    try {
      await createJournalReply(entry.id, {
        quote_text: quote,
        body: body.trim(),
        visibility: 'private',
      });
    } catch {
      // Still open the DM — private storage is best-effort.
    } finally {
      setSending(false);
    }
    onPrivateReply(entry, quote, body.trim());
    close();
  };

  return (
    <AnimatedBottomSheet
      visible={visible && !!entry}
      onClose={onClose}
      maxHeightRatio={0.9}
      keyboardAware
    >
      {({ close }) => (
        <>
          <View style={tw`px-gutter-wide pb-3 flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-callout font-bold text-ink`}>Reply to a line</Text>
              <Text style={tw`text-sm text-ink-3 mt-0.5`} numberOfLines={1}>
                {entry?.username} · conversation starter
              </Text>
            </View>
            <PressableScale
              onPress={close}
              pressedScale={0.9}
              hitSlop={8}
              accessibilityLabel="Close"
              style={tw`w-10 h-10 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={20} color={theme.colors.ink2} />
            </PressableScale>
          </View>

          <ScrollView
            style={tw`px-gutter-wide`}
            contentContainerStyle={tw`pb-8`}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1`}>
              Choose a sentence
            </Text>
            <Text style={tw`text-sm text-ink-3 mb-3`}>
              Tap a line, then reply in the circle thread or send a private note.
            </Text>
            {sentences.map((s, idx) => {
              const selected = quote === s;
              return (
                <PressableScale
                  pressedScale={0.98}
                  key={`${idx}-${s.slice(0, 32)}`}
                  onPress={() => {
                    feedback.select();
                    setQuote(s);
                  }}
                  style={tw`mb-2 p-3 rounded-card border flex-row ${
                    selected
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-card border-line'
                  }`}
                >
                  <Text style={tw`text-emerald-700/70 text-lg mr-2 mt-[-2px]`}>“</Text>
                  <Text style={tw`flex-1 text-body text-ink leading-6`}>{s}</Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={theme.colors.brand}
                      style={tw`ml-2 mt-0.5`}
                    />
                  ) : null}
                </PressableScale>
              );
            })}

            {quote ? (
              <View style={tw`mt-4 mb-3`}>
                <Text
                  style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}
                >
                  Your reply
                </Text>
                <View style={tw`bg-emerald-50 border border-emerald-100 rounded-card px-3 py-2 mb-3`}>
                  <Text style={tw`text-xs text-emerald-800 italic`} numberOfLines={3}>
                    “{quote}”
                  </Text>
                </View>
                <TextInput
                  {...formInputAccessoryProps({ multiline: true })}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write something kind…"
                  placeholderTextColor={theme.colors.placeholder}
                  multiline
                  style={tw`bg-card border border-line rounded-card px-4 py-3 min-h-[88px] text-ink text-body`}
                  textAlignVertical="top"
                />
                <View style={tw`flex-row gap-2 mt-3`}>
                  <PressableScale
                    onPress={() => void submitPublic()}
                    disabled={sending || !body.trim()}
                    style={tw`flex-1 py-3.5 rounded-card bg-emerald-600 items-center justify-center ${
                      sending || !body.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    {sending ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={tw`text-white font-bold text-sm`}>Reply in circle</Text>
                        <Text style={tw`text-white/80 text-caption mt-0.5`}>
                          Visible to friends
                        </Text>
                      </>
                    )}
                  </PressableScale>
                  <PressableScale
                    onPress={() => void submitPrivate(close)}
                    disabled={!body.trim()}
                    style={tw`flex-1 py-3.5 rounded-card bg-energy-50 border border-red-200 items-center justify-center ${
                      !body.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    <Text style={tw`text-rose-600 font-bold text-sm`}>Private message</Text>
                    <Text style={tw`text-rose-400 text-caption mt-0.5`}>Only you two</Text>
                  </PressableScale>
                </View>
              </View>
            ) : null}

            <Text
              style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2 mt-4`}
            >
              Circle replies
            </Text>
            {loading ? (
              <SkeletonList variant="comment" count={2} />
            ) : replies.length === 0 ? (
              <Text style={tw`text-sm text-ink-3 mb-4`}>
                No public replies yet — be the first conversation.
              </Text>
            ) : (
              replies.map((r) => {
                return (
                  <View
                    key={r.id}
                    style={tw`mb-3 bg-card border border-line rounded-card p-3`}
                  >
                    <View style={tw`flex-row items-center mb-2`}>
                      <GrowAvatar
                        userId={r.user_id}
                        username={r.username || 'Member'}
                        uri={r.avatar}
                        size={32}
                        style={tw`mr-2`}
                      />
                      <Text style={tw`font-semibold text-ink flex-1`} numberOfLines={1}>
                        {r.username || 'Member'}
                      </Text>
                    </View>
                    <Text style={tw`text-xs text-emerald-800 italic mb-1.5`} numberOfLines={2}>
                      “{r.quote_text}”
                    </Text>
                    <Text style={tw`text-body text-ink leading-5`}>{r.body}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </AnimatedBottomSheet>
  );
}
