import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import {
  createJournalReply,
  listJournalReplies,
  type CircleJournalEntry,
  type JournalReply,
} from '../../services/api/journal';
import { formInputAccessoryProps } from '../ui/KeyboardDoneAccessory';
import { resolveAvatarUri } from '../../utils/images';
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
          <View style={tw`px-5 pb-3 flex-row items-center justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-lg font-bold text-stone-900`}>Reply to a line</Text>
              <Text style={tw`text-sm text-stone-500 mt-0.5`} numberOfLines={1}>
                {entry?.username} · conversation starter
              </Text>
            </View>
            <Pressable
              onPress={close}
              style={tw`w-10 h-10 rounded-full bg-[#EAE4D6] items-center justify-center`}
            >
              <Ionicons name="close" size={20} color="#44403C" />
            </Pressable>
          </View>

          <ScrollView
            style={tw`px-5`}
            contentContainerStyle={tw`pb-8`}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-1`}>
              Choose a sentence
            </Text>
            <Text style={tw`text-sm text-stone-500 mb-3`}>
              Tap a line, then reply in the circle thread or send a private note.
            </Text>
            {sentences.map((s, idx) => {
              const selected = quote === s;
              return (
                <Pressable
                  key={`${idx}-${s.slice(0, 32)}`}
                  onPress={() => {
                    feedback.select();
                    setQuote(s);
                  }}
                  style={tw`mb-2 px-3.5 py-3 rounded-2xl border flex-row ${
                    selected
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-stone-200'
                  }`}
                >
                  <Text style={tw`text-emerald-700/70 text-lg mr-2 mt-[-2px]`}>“</Text>
                  <Text style={tw`flex-1 text-[15px] text-stone-800 leading-6`}>{s}</Text>
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#059669"
                      style={tw`ml-2 mt-0.5`}
                    />
                  ) : null}
                </Pressable>
              );
            })}

            {quote ? (
              <View style={tw`mt-4 mb-3`}>
                <Text
                  style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2`}
                >
                  Your reply
                </Text>
                <View style={tw`bg-[#ECFDF5] border border-emerald-100 rounded-2xl px-3 py-2 mb-3`}>
                  <Text style={tw`text-xs text-emerald-800 italic`} numberOfLines={3}>
                    “{quote}”
                  </Text>
                </View>
                <TextInput
                  {...formInputAccessoryProps({ multiline: true })}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write something kind…"
                  placeholderTextColor="#A8A29E"
                  multiline
                  style={tw`bg-white border border-stone-200 rounded-2xl px-4 py-3 min-h-[88px] text-stone-900 text-[15px]`}
                  textAlignVertical="top"
                />
                <View style={tw`flex-row gap-2 mt-3`}>
                  <Pressable
                    onPress={() => void submitPublic()}
                    disabled={sending || !body.trim()}
                    style={tw`flex-1 py-3.5 rounded-2xl bg-emerald-600 items-center justify-center ${
                      sending || !body.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    {sending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={tw`text-white font-bold text-sm`}>Reply in circle</Text>
                        <Text style={tw`text-emerald-100 text-[11px] mt-0.5`}>
                          Visible to friends
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => void submitPrivate(close)}
                    disabled={!body.trim()}
                    style={tw`flex-1 py-3.5 rounded-2xl bg-[#FFF1F0] border border-[#FECACA] items-center justify-center ${
                      !body.trim() ? 'opacity-50' : ''
                    }`}
                  >
                    <Text style={tw`text-[#E11D48] font-bold text-sm`}>Private message</Text>
                    <Text style={tw`text-[#FB7185] text-[11px] mt-0.5`}>Only you two</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Text
              style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-2 mt-4`}
            >
              Circle replies
            </Text>
            {loading ? (
              <SkeletonList variant="comment" count={2} />
            ) : replies.length === 0 ? (
              <Text style={tw`text-sm text-stone-500 mb-4`}>
                No public replies yet — be the first conversation.
              </Text>
            ) : (
              replies.map((r) => {
                const av = resolveAvatarUri(r.user_id, r.username || 'Member', r.avatar);
                return (
                  <View
                    key={r.id}
                    style={tw`mb-3 bg-white border border-stone-200 rounded-2xl px-3.5 py-3`}
                  >
                    <View style={tw`flex-row items-center mb-2`}>
                      <Image source={{ uri: av }} style={tw`w-8 h-8 rounded-full mr-2`} />
                      <Text style={tw`font-semibold text-stone-900 flex-1`} numberOfLines={1}>
                        {r.username || 'Member'}
                      </Text>
                    </View>
                    <Text style={tw`text-xs text-emerald-800 italic mb-1.5`} numberOfLines={2}>
                      “{r.quote_text}”
                    </Text>
                    <Text style={tw`text-[15px] text-stone-800 leading-5`}>{r.body}</Text>
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
