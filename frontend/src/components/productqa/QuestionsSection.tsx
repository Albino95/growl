import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import Skeleton from '../ui/Skeleton';
import Avatar from '../ui/Avatar';
import AskQuestionSheet from './AskQuestionSheet';
import ReplySheet from './ReplySheet';
import { shortAgo, engageErrorMessage } from './shared';
import {
  ANSWER_MAX,
  answerQuestion,
  askProductQuestion,
  getProductQuestions,
  hideQuestion,
  reportProductQuestion,
  type ProductQuestion,
} from '../../services/api/engage';
import { newIdempotencyKey } from '../../services/api/idempotency';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';

const PREVIEW_COUNT = 3;

/**
 * Product Q&A on the product page. Customers ask; the shop (product owner) answers or
 * hides right here. Hidden entirely on servers without the feature.
 */
export default function QuestionsSection({
  productId,
  productName,
  ownerId,
  viewerId,
}: {
  productId: string;
  productName?: string | null;
  ownerId?: string | null;
  viewerId?: string | null;
}) {
  const isOwner = !!viewerId && !!ownerId && viewerId === ownerId;
  const [questions, setQuestions] = useState<ProductQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answering, setAnswering] = useState<ProductQuestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [askKey, setAskKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const list = await getProductQuestions(productId);
      if (list === null) setUnsupported(true);
      else setQuestions(list);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (unsupported) return null;

  const submitQuestion = async (body: string) => {
    setBusy(true);
    try {
      const q = await askProductQuestion(productId, body, askKey);
      setQuestions((prev) => [q, ...(prev ?? []).filter((x) => x.id !== q.id)]);
      setAsking(false);
      setAskKey(newIdempotencyKey());
      toast.success('Question sent to the shop');
    } catch (e) {
      void alertMessage('Couldn’t send', engageErrorMessage(e, 'Your question didn’t go through. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (body: string) => {
    if (!answering) return;
    setBusy(true);
    try {
      const q = await answerQuestion(answering.id, body);
      setQuestions((prev) => (prev ?? []).map((x) => (x.id === q.id ? { ...x, answer: q.answer } : x)));
      setAnswering(null);
      toast.success('Answer posted');
    } catch (e) {
      void alertMessage('Couldn’t save', engageErrorMessage(e, 'Your answer didn’t save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onHide = async (q: ProductQuestion) => {
    const ok = await confirmAsync('Hide this question?', 'It disappears from your product page. The asker isn’t told.', {
      confirmLabel: 'Hide',
      destructive: true,
    });
    if (!ok) return;
    try {
      await hideQuestion(q.id);
      setQuestions((prev) => (prev ?? []).filter((x) => x.id !== q.id));
      toast.info('Question hidden');
    } catch (e) {
      void alertMessage('Couldn’t hide', engageErrorMessage(e, 'Try again in a moment.'));
    }
  };

  const onReport = async (q: ProductQuestion) => {
    const ok = await confirmAsync('Report this question?', 'Our team will take a look. Thanks for keeping Grow kind.', {
      confirmLabel: 'Report',
      destructive: true,
    });
    if (!ok) return;
    try {
      await reportProductQuestion(q.id, 'Inappropriate product question');
      toast.success('Thanks — we’ll take a look');
    } catch (e) {
      void alertMessage('Couldn’t report', engageErrorMessage(e, 'Try again in a moment.'));
    }
  };

  const list = questions ?? [];
  const shown = expanded ? list : list.slice(0, PREVIEW_COUNT);

  return (
    <View style={tw`mb-6`} accessibilityLabel="Questions about this product">
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <Text style={tw`text-lg font-semibold text-ink`}>Questions</Text>
        {!isOwner && viewerId ? (
          <PressableScale
            onPress={() => setAsking(true)}
            feedback="open"
            accessibilityRole="button"
            accessibilityLabel="Ask the shop a question"
            style={tw`flex-row items-center px-3 py-1.5 rounded-chip bg-raised`}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.colors.ink2} />
            <Text style={tw`ml-1.5 text-footnote font-semibold text-ink-2`}>Ask</Text>
          </PressableScale>
        ) : null}
      </View>

      {loading && !questions ? (
        <View>
          <Skeleton style={tw`h-4 w-3/4 rounded mb-2`} />
          <Skeleton style={tw`h-4 w-1/2 rounded`} />
        </View>
      ) : failed && !questions ? (
        <PressableScale onPress={() => void load()} accessibilityRole="button">
          <Text style={tw`text-footnote text-ink-3`}>Couldn’t load questions. Tap to try again.</Text>
        </PressableScale>
      ) : list.length === 0 ? (
        <Text style={tw`text-footnote text-ink-3 leading-5`}>
          {isOwner
            ? 'No questions yet. When a customer asks, you’ll get a notification.'
            : 'No questions yet. Curious about sizing, materials or delivery? Ask the shop.'}
        </Text>
      ) : (
        <View>
          {shown.map((q) => (
            <View key={q.id} style={tw`py-3 border-t border-line/60`}>
              <View style={tw`flex-row items-start`}>
                <Avatar uri={q.asker.avatar_url} name={q.asker.name} size="xs" style={tw`mr-2.5 mt-0.5`} />
                <View style={tw`flex-1`}>
                  <Text style={tw`text-body text-ink leading-5`}>{q.body}</Text>
                  <Text style={tw`text-caption text-ink-3 mt-1`}>
                    {q.mine ? 'You' : q.asker.name} · {shortAgo(q.created_at)}
                  </Text>
                </View>
                {!isOwner && !q.mine ? (
                  <PressableScale
                    onPress={() => void onReport(q)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Report question"
                  >
                    <Ionicons name="flag-outline" size={15} color={theme.colors.iconMuted} />
                  </PressableScale>
                ) : null}
              </View>

              {q.answer ? (
                <View style={tw`mt-2 ml-9 bg-raised rounded-control px-3 py-2.5`}>
                  <Text style={tw`text-caption font-semibold text-ink-2 mb-0.5`}>Answer from the shop</Text>
                  <Text style={tw`text-footnote text-ink leading-5`}>{q.answer.body}</Text>
                </View>
              ) : !isOwner ? (
                <Text style={tw`mt-1.5 ml-9 text-caption text-ink-3`}>Waiting for the shop’s answer</Text>
              ) : null}

              {isOwner ? (
                <View style={tw`flex-row mt-2 ml-9`}>
                  <PressableScale
                    onPress={() => setAnswering(q)}
                    accessibilityRole="button"
                    style={tw`px-3 py-1.5 rounded-chip bg-brand-600 mr-2`}
                  >
                    <Text style={tw`text-caption font-semibold text-white`}>
                      {q.answer ? 'Edit answer' : 'Answer'}
                    </Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() => void onHide(q)}
                    accessibilityRole="button"
                    style={tw`px-3 py-1.5 rounded-chip bg-raised`}
                  >
                    <Text style={tw`text-caption font-semibold text-ink-2`}>Hide</Text>
                  </PressableScale>
                </View>
              ) : null}
            </View>
          ))}
          {list.length > PREVIEW_COUNT ? (
            <PressableScale
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              style={tw`pt-2`}
            >
              <Text style={tw`text-footnote font-semibold text-brand-700`}>
                {expanded ? 'Show fewer' : `Show all ${list.length} questions`}
              </Text>
            </PressableScale>
          ) : null}
        </View>
      )}

      <AskQuestionSheet
        visible={asking}
        productName={productName}
        busy={busy}
        onClose={() => setAsking(false)}
        onSubmit={(b) => void submitQuestion(b)}
      />
      <ReplySheet
        visible={!!answering}
        title={answering?.answer ? 'Edit your answer' : 'Answer this question'}
        quote={answering?.body}
        hint="Your answer is public on this product page, and the asker gets a notification."
        initial={answering?.answer?.body ?? ''}
        placeholder="Write a helpful answer"
        maxLength={ANSWER_MAX}
        submitLabel={answering?.answer ? 'Save answer' : 'Post answer'}
        busy={busy}
        onClose={() => setAnswering(null)}
        onSubmit={(b) => void submitAnswer(b)}
      />
    </View>
  );
}
