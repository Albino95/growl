import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme, useColorSchemeName } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import GrowImage from '../../components/ui/GrowImage';
import { StarRow } from '../../components/instructor/StarRating';
import ReplySheet from '../../components/productqa/ReplySheet';
import { shortAgo, engageErrorMessage } from '../../components/productqa/shared';
import {
  ANSWER_MAX,
  answerQuestion,
  getEngageSummary,
  hideQuestion,
  listBusinessQuestions,
  listBusinessReviews,
  replyToReview,
  type EngageProductRef,
  type EngageSummary,
  type ProductQuestion,
  type ProductReview,
} from '../../services/api/engage';
import { resolveProductImageUri } from '../../utils/images';
import { useRefresh, REFRESH_TINT } from '../../hooks/useRefresh';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { triggerFeedback } from '../../utils/interactionFeedback';
import { verticalScrollProps } from '../../constants/scroll';

type Tab = 'questions' | 'reviews';
type Item = { kind: 'q'; q: ProductQuestion } | { kind: 'r'; r: ProductReview };

/** Business: customer questions to answer and reviews to reply to. */
export default function QuestionsReviewsScreen() {
  useColorSchemeName();
  const [tab, setTab] = useState<Tab>('questions');
  const [showAll, setShowAll] = useState(false);
  const [questions, setQuestions] = useState<ProductQuestion[] | null>(null);
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [summary, setSummary] = useState<EngageSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [target, setTarget] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [s, list] = await Promise.all([
        getEngageSummary().catch(() => null),
        tab === 'questions'
          ? listBusinessQuestions(showAll ? 'all' : 'unanswered')
          : listBusinessReviews(showAll ? 'all' : 'unreplied'),
      ]);
      setSummary(s);
      if (tab === 'questions') setQuestions(list as ProductQuestion[]);
      else setReviews(list as ProductReview[]);
    } catch {
      setFailed(true);
    }
  }, [tab, showAll]);

  useEffect(() => {
    if (tab === 'questions') setQuestions(null);
    else setReviews(null);
    void load();
  }, [load, tab]);

  const refresh = useRefresh(load);

  const items: Item[] | null =
    tab === 'questions'
      ? questions?.map((q) => ({ kind: 'q' as const, q })) ?? null
      : reviews?.map((r) => ({ kind: 'r' as const, r })) ?? null;

  const submit = async (body: string) => {
    if (!target) return;
    setBusy(true);
    try {
      if (target.kind === 'q') {
        const q = await answerQuestion(target.q.id, body);
        setQuestions((prev) =>
          (prev ?? [])
            .map((x) => (x.id === q.id ? { ...x, answer: q.answer } : x))
            .filter((x) => showAll || !x.answer)
        );
        if (!target.q.answer) {
          setSummary((s) => (s ? { ...s, unanswered_questions: Math.max(0, s.unanswered_questions - 1) } : s));
        }
        toast.success('Answer posted');
      } else {
        const r = await replyToReview(target.r.id, body);
        setReviews((prev) =>
          (prev ?? [])
            .map((x) => (x.id === r.id ? { ...x, reply: r.reply } : x))
            .filter((x) => showAll || !x.reply)
        );
        if (!target.r.reply) {
          setSummary((s) => (s ? { ...s, unreplied_reviews: Math.max(0, s.unreplied_reviews - 1) } : s));
        }
        toast.success('Reply posted');
      }
      setTarget(null);
    } catch (e) {
      void alertMessage('Couldn’t save', engageErrorMessage(e, 'That didn’t save. Try again.'));
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
      if (!q.answer) {
        setSummary((s) => (s ? { ...s, unanswered_questions: Math.max(0, s.unanswered_questions - 1) } : s));
      }
      toast.info('Question hidden');
    } catch (e) {
      void alertMessage('Couldn’t hide', engageErrorMessage(e, 'Try again in a moment.'));
    }
  };

  const tabButton = (key: Tab, label: string, count: number) => {
    const active = tab === key;
    return (
      <PressableScale
        key={key}
        onPress={() => {
          if (active) return;
          triggerFeedback('chip');
          setTab(key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        style={tw`flex-1 flex-row items-center justify-center py-2 rounded-control ${active ? 'bg-card' : ''}`}
      >
        <Text style={tw`text-footnote font-semibold ${active ? 'text-ink' : 'text-ink-3'}`}>{label}</Text>
        {count > 0 ? (
          <View style={tw`ml-1.5 px-1.5 min-w-[18px] h-[18px] rounded-full bg-brand-600 items-center justify-center`}>
            <Text style={tw`text-[11px] font-bold text-white`}>{count > 99 ? '99+' : count}</Text>
          </View>
        ) : null}
      </PressableScale>
    );
  };

  const productLine = (p: EngageProductRef | null | undefined) => {
    if (!p) return null;
    const thumb = resolveProductImageUri(p.image_url);
    return (
      <View style={tw`flex-row items-center mb-2`}>
        {thumb ? (
          <GrowImage source={{ uri: thumb }} style={tw`w-6 h-6 rounded bg-raised mr-2`} contentFit="cover" />
        ) : (
          <View style={tw`w-6 h-6 rounded bg-raised mr-2 items-center justify-center`}>
            <Ionicons name="cube-outline" size={13} color={theme.colors.iconMuted} />
          </View>
        )}
        <Text style={tw`text-caption font-semibold text-ink-2 flex-1`} numberOfLines={1}>
          {p.name}
        </Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'q') {
      const q = item.q;
      return (
        <View style={tw`mx-gutter mb-3 p-4 bg-card border border-line/80 rounded-card`}>
          {productLine(q.product)}
          <Text style={tw`text-body text-ink leading-5`}>{q.body}</Text>
          <Text style={tw`text-caption text-ink-3 mt-1`}>
            {q.asker.name} · {shortAgo(q.created_at)}
          </Text>
          {q.answer ? (
            <View style={tw`mt-2 bg-raised rounded-control px-3 py-2`}>
              <Text style={tw`text-caption font-semibold text-ink-2 mb-0.5`}>Your answer</Text>
              <Text style={tw`text-footnote text-ink leading-5`}>{q.answer.body}</Text>
            </View>
          ) : null}
          <View style={tw`flex-row mt-3`}>
            <PressableScale
              onPress={() => setTarget(item)}
              accessibilityRole="button"
              style={tw`px-3.5 py-2 rounded-chip bg-brand-600 mr-2`}
            >
              <Text style={tw`text-footnote font-semibold text-white`}>{q.answer ? 'Edit answer' : 'Answer'}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => void onHide(q)}
              accessibilityRole="button"
              style={tw`px-3.5 py-2 rounded-chip bg-raised`}
            >
              <Text style={tw`text-footnote font-semibold text-ink-2`}>Hide</Text>
            </PressableScale>
          </View>
        </View>
      );
    }
    const r = item.r;
    return (
      <View style={tw`mx-gutter mb-3 p-4 bg-card border border-line/80 rounded-card`}>
        {productLine(r.product)}
        <View style={tw`flex-row items-center`}>
          <StarRow value={r.rating} size={13} />
          <Text style={tw`ml-2 text-caption text-ink-3`}>
            {r.author.name} · {shortAgo(r.created_at)}
          </Text>
        </View>
        {r.body ? <Text style={tw`text-body text-ink leading-5 mt-1.5`}>{r.body}</Text> : null}
        {r.reply ? (
          <View style={tw`mt-2 bg-raised rounded-control px-3 py-2`}>
            <Text style={tw`text-caption font-semibold text-ink-2 mb-0.5`}>Your reply</Text>
            <Text style={tw`text-footnote text-ink leading-5`}>{r.reply.body}</Text>
          </View>
        ) : null}
        <PressableScale
          onPress={() => setTarget(item)}
          accessibilityRole="button"
          style={tw`self-start mt-3 px-3.5 py-2 rounded-chip bg-brand-600`}
        >
          <Text style={tw`text-footnote font-semibold text-white`}>{r.reply ? 'Edit reply' : 'Reply'}</Text>
        </PressableScale>
      </View>
    );
  };

  const empty =
    tab === 'questions' ? (
      <EmptyState
        icon="chatbubble-ellipses-outline"
        title={showAll ? 'No questions yet' : 'All caught up'}
        description={
          showAll
            ? 'Customers can ask about any of your products right on the product page. You’ll get a notification.'
            : 'No questions are waiting for an answer.'
        }
      />
    ) : (
      <EmptyState
        icon="star-outline"
        title={showAll ? 'No reviews yet' : 'All caught up'}
        description={
          showAll
            ? 'Reviews open to customers after a delivered purchase. Thank people when they come in.'
            : 'Every review has a reply.'
        }
      />
    );

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <View style={tw`px-gutter pt-3 pb-2`}>
        <View style={tw`flex-row bg-raised rounded-control p-1`} accessibilityRole="tablist">
          {tabButton('questions', 'Questions', summary?.unanswered_questions ?? 0)}
          {tabButton('reviews', 'Reviews', summary?.unreplied_reviews ?? 0)}
        </View>
        <View style={tw`flex-row mt-2.5`}>
          {[false, true].map((all) => {
            const active = showAll === all;
            return (
              <PressableScale
                key={String(all)}
                onPress={() => setShowAll(all)}
                feedback="chip"
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={tw`px-3 py-1.5 rounded-chip mr-2 border ${
                  active ? 'bg-brand-600 border-brand-600' : 'bg-card border-line/80'
                }`}
              >
                <Text style={tw`text-caption font-semibold ${active ? 'text-white' : 'text-ink-2'}`}>
                  {all ? 'All' : tab === 'questions' ? 'Unanswered' : 'Needs a reply'}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {failed && !items ? (
        <ErrorState message="We couldn’t load this right now." onRetry={() => void load()} />
      ) : !items ? (
        <View style={tw`px-gutter pt-2`}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={tw`h-28 w-full rounded-card mb-3`} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => (it.kind === 'q' ? `q_${it.q.id}` : `r_${it.r.id}`)}
          renderItem={renderItem}
          contentContainerStyle={tw`pt-2 pb-10 ${items.length === 0 ? 'flex-grow justify-center' : ''}`}
          ListEmptyComponent={empty}
          refreshControl={<RefreshControl {...refresh} tintColor={REFRESH_TINT} colors={[REFRESH_TINT]} />}
          {...verticalScrollProps}
        />
      )}

      <ReplySheet
        visible={!!target}
        title={
          target?.kind === 'q'
            ? target.q.answer
              ? 'Edit your answer'
              : 'Answer this question'
            : target?.r.reply
              ? 'Edit your reply'
              : 'Reply to this review'
        }
        quote={target ? (target.kind === 'q' ? target.q.body : target.r.body || `${target.r.rating} stars`) : null}
        hint={
          target?.kind === 'q'
            ? 'Your answer is public on the product page, and the asker gets a notification.'
            : 'Your reply is public under the review, and the reviewer gets a notification.'
        }
        initial={target ? (target.kind === 'q' ? target.q.answer?.body ?? '' : target.r.reply?.body ?? '') : ''}
        placeholder={target?.kind === 'q' ? 'Write a helpful answer' : 'Thank them, or help with what went wrong'}
        maxLength={ANSWER_MAX}
        submitLabel={target?.kind === 'q' ? 'Post answer' : 'Post reply'}
        busy={busy}
        onClose={() => setTarget(null)}
        onSubmit={(b) => void submit(b)}
      />
    </SafeAreaView>
  );
}
