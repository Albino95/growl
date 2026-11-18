import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import KeyboardInsetView from '../ui/KeyboardInsetView';
import PressableScale from '../ui/PressableScale';
import { StarPicker } from '../instructor/StarRating';
import tw, { theme } from '../../lib/tw';
import { REVIEW_MAX, type ProductReview } from '../../services/api/engage';

/** Write / edit a product review. Only opened for verified purchasers (viewer.can_review). */
export default function ReviewSheet({
  visible,
  productName,
  mine,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  productName?: string | null;
  mine?: ProductReview | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: { rating: number; body: string }) => void;
}) {
  const seedRating = mine?.rating || 5;
  const seedBody = mine?.body || '';
  const [rating, setRating] = useState(seedRating);
  const [body, setBody] = useState(seedBody);
  useEffect(() => {
    if (!visible) return;
    setRating(seedRating);
    setBody(seedBody);
  }, [visible, seedRating, seedBody]);

  const tooLong = body.trim().length > REVIEW_MAX;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardInsetView style={tw`flex-1 justify-end bg-black/40`} contentStyle={tw`justify-end`}>
        <View style={tw`bg-page rounded-t-sheet px-gutter pt-4 pb-8`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-title font-bold text-ink flex-1 mr-3`} numberOfLines={1}>
              {mine ? 'Edit your review' : 'Review this product'}
            </Text>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={tw`w-9 h-9 rounded-full bg-raised items-center justify-center`}
            >
              <Ionicons name="close" size={18} color={theme.colors.ink} />
            </PressableScale>
          </View>
          <Text style={tw`text-footnote text-ink-3 mb-4 leading-5`}>
            {productName ? `${productName} · ` : ''}Shown with a “Verified purchase” label. Be specific and kind.
          </Text>
          <StarPicker label="Your rating" value={rating} onChange={setRating} />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="How is it in everyday use?"
            placeholderTextColor={theme.colors.placeholder}
            multiline
            maxLength={REVIEW_MAX + 50}
            style={tw`bg-card border border-line/80 rounded-card px-3.5 py-3 text-body text-ink min-h-[96px] max-h-48`}
            textAlignVertical="top"
            accessibilityLabel="Your review"
          />
          <Text style={tw`text-caption mt-1.5 mb-4 text-right ${tooLong ? 'text-red-600' : 'text-ink-3'}`}>
            {body.trim().length}/{REVIEW_MAX}
          </Text>
          <PressableScale
            onPress={() => !busy && !tooLong && onSubmit({ rating, body: body.trim() })}
            disabled={busy || tooLong}
            feedback="send"
            accessibilityRole="button"
            style={tw`py-3.5 rounded-control bg-brand-600 items-center ${busy || tooLong ? 'opacity-50' : ''}`}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={tw`text-white font-bold`}>{mine ? 'Update review' : 'Post review'}</Text>
            )}
          </PressableScale>
        </View>
      </KeyboardInsetView>
    </Modal>
  );
}
