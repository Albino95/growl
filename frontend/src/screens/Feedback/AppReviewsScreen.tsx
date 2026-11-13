import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import FadeInUp from '../../components/ui/FadeInUp';
import { StarPicker, StarRow } from '../../components/instructor/StarRating';
import { TAB_SCREEN_BOTTOM_PADDING } from '../../constants/scroll';
import {
  listAppReviews,
  replyToAppReview,
  upsertAppReview,
  type AppReview,
} from '../../services/api/appReviews';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { feedback } from '../../utils/interactionFeedback';
import { openAppStoreReview } from '../../utils/appStoreReview';

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ReviewCard({
  review,
  canReply,
  onReplied,
}: {
  review: AppReview;
  canReply: boolean;
  onReplied: (next: AppReview) => void;
}) {
  const [draft, setDraft] = useState(review.reply?.body || '');
  const [busy, setBusy] = useState(false);

  const sendReply = async () => {
    if (draft.trim().length < 8) {
      alertMessage('A little longer', 'Replies need at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const next = await replyToAppReview(review.id, draft);
      feedback.success();
      onReplied(next);
    } catch (err) {
      alertMessage('Could not reply', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-4 py-3.5 mb-3`}>
      <View style={tw`flex-row items-center justify-between mb-1.5`}>
        <Text style={tw`font-semibold text-stone-900`}>{review.author.username}</Text>
        <Text style={tw`text-[11px] text-stone-500`}>{timeAgo(review.created_at)}</Text>
      </View>
      <StarRow value={review.stars} size={14} />
      <Text style={tw`text-stone-700 leading-5 mt-2`}>{review.body}</Text>
      {review.email ? (
        <Text style={tw`text-[11px] text-stone-500 mt-1`}>{review.email}</Text>
      ) : null}

      {review.reply ? (
        <View style={tw`mt-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-800 uppercase`}>
            {review.reply.from}
          </Text>
          <Text style={tw`text-stone-800 leading-5 mt-1`}>{review.reply.body}</Text>
        </View>
      ) : canReply && !review.mine ? (
        <View style={tw`mt-3`}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Thanks for the feedback — we’ll look at this…"
            placeholderTextColor="#6B645E"
            multiline
            style={tw`min-h-[72px] bg-[#F3EEE4] rounded-xl px-3 py-2.5 text-stone-800`}
          />
          <PressableScale
            feedback="success"
            onPress={() => void sendReply()}
            disabled={busy}
            style={tw`mt-2 self-end bg-emerald-600 rounded-full px-4 py-2 ${busy ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-semibold text-sm`}>
              {busy ? 'Sending…' : review.reply ? 'Update reply' : 'Reply'}
            </Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

export default function AppReviewsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviews, setReviews] = useState<AppReview[]>([]);
  const [mine, setMine] = useState<AppReview | null>(null);
  const [canReply, setCanReply] = useState(false);
  const [summary, setSummary] = useState<{ count: number; avg: number | null }>({
    count: 0,
    avg: null,
  });
  const [stars, setStars] = useState(5);
  const [body, setBody] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await listAppReviews();
      setReviews(res.reviews);
      setMine(res.mine);
      setCanReply(res.can_reply);
      setSummary(res.summary);
      if (res.mine) {
        setStars(res.mine.stars);
        setBody(res.mine.body);
      }
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const save = async () => {
    if (body.trim().length < 8) {
      alertMessage('A little longer', 'Tell us what felt good or what we should fix (8+ characters).');
      return;
    }
    setSaving(true);
    try {
      const review = await upsertAppReview({ stars, body });
      feedback.success();
      setMine(review);
      setReviews((prev) => {
        const rest = prev.filter((r) => r.id !== review.id);
        return [review, ...rest];
      });
      if (mine) {
        toast.success('Review updated');
      } else {
        alertMessage(
          'We hear you',
          'Thank you. We read every note. When we’ve sat with what you said, you’ll see a reply here — then we’ll ask if a public App Store note feels fair.'
        );
      }
    } catch (err) {
      alertMessage('Could not save', err instanceof Error ? err.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const inbox = canReply ? reviews.filter((r) => !r.mine && !r.reply) : [];
  const wall = reviews.filter((r) => (canReply ? true : r.id !== mine?.id));

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        leftAccessory={
          <PressableScale
            feedback="close"
            onPress={() => navigation.goBack()}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
          >
            <Ionicons name="arrow-back" size={18} color="#1C1917" />
          </PressableScale>
        }
      />

      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {loading ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color="#059669" />
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[tw`px-5 pt-3`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
          >
            <FadeInUp>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                We’re listening
              </Text>
              <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>Review Grow!</Text>
              <Text style={tw`text-stone-500 leading-5 mt-1.5`}>
                Tell us what’s working and what hurt. We read every note and reply here first.
                After we’ve sat with it, if we made it right, we’ll ask you for a public App Store note.
              </Text>
              {summary.count > 0 ? (
                <View style={tw`flex-row items-center mt-3`}>
                  <StarRow value={summary.avg || 0} />
                  <Text style={tw`text-sm text-stone-600 ml-2`}>
                    {summary.avg?.toFixed(1) || '—'} · {summary.count}{' '}
                    {summary.count === 1 ? 'review' : 'reviews'}
                  </Text>
                </View>
              ) : null}
            </FadeInUp>

            <View style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-4 py-4 mt-5`}>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                {mine ? 'Your review' : 'Leave a review'}
              </Text>
              <Text style={tw`text-lg font-bold text-stone-900 mt-0.5 mb-2`}>
                {mine ? 'You can update this anytime' : 'Be honest. Be kind. Be specific.'}
              </Text>
              <StarPicker value={stars} onChange={setStars} />
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="The journal felt calm, but I couldn’t find instructors…"
                placeholderTextColor="#6B645E"
                multiline
                style={tw`min-h-[110px] bg-[#F3EEE4] rounded-xl px-3 py-3 text-stone-800`}
              />
              <PrimaryButton
                label={saving ? 'Saving…' : mine ? 'Update review' : 'Send review'}
                onPress={() => void save()}
                disabled={saving}
                style={tw`mt-3`}
              />
            </View>

            {mine?.reply ? (
              <View style={tw`mt-4 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-800 uppercase`}>
                  We sat with this
                </Text>
                <Text style={tw`text-stone-800 leading-5 mt-1.5`}>{mine.reply.body}</Text>
                {Platform.OS === 'ios' ? (
                  <>
                    <Text style={tw`text-sm text-stone-600 leading-5 mt-3`}>
                      If that helped — even a little — a public note on the App Store tells other
                      people we show up. No pressure. Only if it feels fair.
                    </Text>
                    <PressableScale
                      feedback="send"
                      onPress={() => void openAppStoreReview()}
                      style={tw`mt-3 py-3 rounded-2xl bg-emerald-600 items-center`}
                    >
                      <Text style={tw`text-white font-bold`}>Leave an App Store note</Text>
                    </PressableScale>
                  </>
                ) : null}
              </View>
            ) : null}

            {canReply && inbox.length > 0 ? (
              <View style={tw`mt-7`}>
                <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                  Inbox
                </Text>
                <Text style={tw`text-lg font-bold text-stone-900 mt-0.5 mb-3`}>
                  Waiting for a thank-you
                </Text>
                {inbox.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    canReply
                    onReplied={(next) =>
                      setReviews((prev) => prev.map((r) => (r.id === next.id ? next : r)))
                    }
                  />
                ))}
              </View>
            ) : null}

            <View style={tw`mt-7`}>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
                Community
              </Text>
              <Text style={tw`text-lg font-bold text-stone-900 mt-0.5 mb-3`}>
                What people are saying
              </Text>
              {wall.length === 0 ? (
                <View style={tw`bg-[#EAE4D6] rounded-2xl px-4 py-6 items-center`}>
                  <Text style={tw`text-stone-600 text-center`}>
                    First one in? Be the person who tells us something useful.
                  </Text>
                </View>
              ) : (
                wall.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    canReply={canReply}
                    onReplied={(next) =>
                      setReviews((prev) => prev.map((r) => (r.id === next.id ? next : r)))
                    }
                  />
                ))
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
