import React, { useCallback, useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import Skeleton from '../ui/Skeleton';
import Avatar from '../ui/Avatar';
import { StarRow } from '../instructor/StarRating';
import ReviewSheet from './ReviewSheet';
import ReplySheet from './ReplySheet';
import { shortAgo, engageErrorMessage } from './shared';
import {
  ANSWER_MAX,
  getProductReviews,
  replyToReview,
  reportProductReview,
  writeProductReview,
  type ProductReview,
  type ProductReviews,
} from '../../services/api/engage';
import { newIdempotencyKey } from '../../services/api/idempotency';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';

const PREVIEW_COUNT = 3;

/**
 * Verified-purchase reviews on the product page, with one reply from the shop.
 * The write button only appears for people with a delivered order of this product.
 */
export default function ReviewsSection({
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
  const [data, setData] = useState<ProductReviews | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [writing, setWriting] = useState(false);
  const [replying, setReplying] = useState<ProductReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeKey, setWriteKey] = useState(newIdempotencyKey);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await getProductReviews(productId);
      if (res === null) setUnsupported(true);
      else setData(res);
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

  const reviews = data?.reviews ?? [];
  const mine = reviews.find((r) => r.mine) ?? null;
  const canReview = !!data?.viewer.can_review;
  const needsPurchase = data?.viewer.reason === 'needs_purchase';

  const submitReview = async (input: { rating: number; body: string }) => {
    setBusy(true);
    try {
      await writeProductReview(productId, input, writeKey);
      setWriting(false);
      setWriteKey(newIdempotencyKey());
      toast.success(mine ? 'Review updated' : 'Thanks for your review');
      void load();
    } catch (e) {
      void alertMessage('Couldn’t save', engageErrorMessage(e, 'Your review didn’t save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const submitReply = async (body: string) => {
    if (!replying) return;
    setBusy(true);
    try {
      const r = await replyToReview(replying.id, body);
      setData((prev) =>
        prev ? { ...prev, reviews: prev.reviews.map((x) => (x.id === r.id ? { ...x, reply: r.reply } : x)) } : prev
      );
      setReplying(null);
      toast.success('Reply posted');
    } catch (e) {
      void alertMessage('Couldn’t save', engageErrorMessage(e, 'Your reply didn’t save. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const onReport = async (r: ProductReview) => {
    const ok = await confirmAsync('Report this review?', 'Our team will take a look. Thanks for keeping Grow kind.', {
      confirmLabel: 'Report',
      destructive: true,
    });
    if (!ok) return;
    try {
      await reportProductReview(r.id, 'Inappropriate product review');
      toast.success('Thanks — we’ll take a look');
    } catch (e) {
      void alertMessage('Couldn’t report', engageErrorMessage(e, 'Try again in a moment.'));
    }
  };

  const shown = expanded ? reviews : reviews.slice(0, PREVIEW_COUNT);

  return (
    <View style={tw`mb-6`} accessibilityLabel="Reviews of this product">
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <View style={tw`flex-row items-center`}>
          <Text style={tw`text-lg font-semibold text-ink mr-2`}>Reviews</Text>
          {data && data.count > 0 ? (
            <View
              style={tw`flex-row items-center`}
              accessibilityLabel={`${data.average} out of 5, ${data.count} review${data.count === 1 ? '' : 's'}`}
            >
              <StarRow value={data.average} size={13} />
              <Text style={tw`ml-1.5 text-footnote text-ink-2`}>
                {data.average.toFixed(1)} · {data.count}
              </Text>
            </View>
          ) : null}
        </View>
        {canReview ? (
          <PressableScale
            onPress={() => setWriting(true)}
            feedback="open"
            accessibilityRole="button"
            style={tw`flex-row items-center px-3 py-1.5 rounded-chip bg-raised`}
          >
            <Ionicons name="create-outline" size={15} color={theme.colors.ink2} />
            <Text style={tw`ml-1.5 text-footnote font-semibold text-ink-2`}>{mine ? 'Edit yours' : 'Write'}</Text>
          </PressableScale>
        ) : null}
      </View>

      {loading && !data ? (
        <View>
          <Skeleton style={tw`h-4 w-2/3 rounded mb-2`} />
          <Skeleton style={tw`h-4 w-1/2 rounded`} />
        </View>
      ) : failed && !data ? (
        <PressableScale onPress={() => void load()} accessibilityRole="button">
          <Text style={tw`text-footnote text-ink-3`}>Couldn’t load reviews. Tap to try again.</Text>
        </PressableScale>
      ) : reviews.length === 0 ? (
        <Text style={tw`text-footnote text-ink-3 leading-5`}>
          {isOwner
            ? 'No reviews yet. Reviews open to customers after a delivered purchase.'
            : canReview
              ? 'No reviews yet. You bought this — tell others how it is.'
              : 'No reviews yet. Reviews open after a purchase.'}
        </Text>
      ) : (
        <View>
          {shown.map((r) => (
            <View key={r.id} style={tw`py-3 border-t border-line/60`}>
              <View style={tw`flex-row items-start`}>
                <Avatar uri={r.author.avatar_url} name={r.author.name} size="xs" style={tw`mr-2.5 mt-0.5`} />
                <View style={tw`flex-1`}>
                  <View style={tw`flex-row items-center flex-wrap`}>
                    <StarRow value={r.rating} size={12} />
                    <Text style={tw`ml-2 text-caption text-ink-3`}>
                      {r.mine ? 'You' : r.author.name} · {shortAgo(r.created_at)}
                    </Text>
                  </View>
                  {r.verified_purchase ? (
                    <View style={tw`flex-row items-center mt-1`}>
                      <Ionicons name="checkmark-circle" size={12} color={theme.colors.brand} />
                      <Text style={tw`ml-1 text-caption font-semibold text-brand-700`}>Verified purchase</Text>
                    </View>
                  ) : null}
                  {r.body ? <Text style={tw`text-body text-ink leading-5 mt-1.5`}>{r.body}</Text> : null}
                </View>
                {!isOwner && !r.mine ? (
                  <PressableScale
                    onPress={() => void onReport(r)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Report review"
                  >
                    <Ionicons name="flag-outline" size={15} color={theme.colors.iconMuted} />
                  </PressableScale>
                ) : null}
              </View>
              {r.reply ? (
                <View style={tw`mt-2 ml-9 bg-raised rounded-control px-3 py-2.5`}>
                  <Text style={tw`text-caption font-semibold text-ink-2 mb-0.5`}>Reply from the shop</Text>
                  <Text style={tw`text-footnote text-ink leading-5`}>{r.reply.body}</Text>
                </View>
              ) : null}
              {isOwner ? (
                <PressableScale
                  onPress={() => setReplying(r)}
                  accessibilityRole="button"
                  style={tw`self-start mt-2 ml-9 px-3 py-1.5 rounded-chip bg-brand-600`}
                >
                  <Text style={tw`text-caption font-semibold text-white`}>{r.reply ? 'Edit reply' : 'Reply'}</Text>
                </PressableScale>
              ) : null}
            </View>
          ))}
          {reviews.length > PREVIEW_COUNT ? (
            <PressableScale onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={tw`pt-2`}>
              <Text style={tw`text-footnote font-semibold text-brand-700`}>
                {expanded ? 'Show fewer' : `Show all ${reviews.length} reviews`}
              </Text>
            </PressableScale>
          ) : null}
          {needsPurchase ? (
            <Text style={tw`text-caption text-ink-3 mt-2`}>Reviews open after a purchase.</Text>
          ) : null}
        </View>
      )}

      {canReview ? (
        <ReviewSheet
          visible={writing}
          productName={productName}
          mine={mine}
          busy={busy}
          onClose={() => setWriting(false)}
          onSubmit={(input) => void submitReview(input)}
        />
      ) : null}
      <ReplySheet
        visible={!!replying}
        title={replying?.reply ? 'Edit your reply' : 'Reply to this review'}
        quote={replying?.body || (replying ? `${replying.rating} stars` : null)}
        hint="Your reply is public under the review, and the reviewer gets a notification."
        initial={replying?.reply?.body ?? ''}
        placeholder="Thank them, or help with what went wrong"
        maxLength={ANSWER_MAX}
        submitLabel={replying?.reply ? 'Save reply' : 'Post reply'}
        busy={busy}
        onClose={() => setReplying(null)}
        onSubmit={(b) => void submitReply(b)}
      />
    </View>
  );
}
