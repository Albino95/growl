import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import GrowAvatar from '../ui/GrowAvatar';
import FadeInUp from '../ui/FadeInUp';
import EmptyState from '../ui/EmptyState';
import ProofMedia from '../proof/ProofMedia';
import { proofSummary } from '../proof/proofDefaults';
import { markProofSeen } from '../../services/api/proofs';
import { sendHomeworkFeedback } from '../../services/api/coaching';
import { getReviewItems, sendQuickDm, type ReviewItem } from '../../services/api/coachq';
import { resolvePostMediaUri } from '../../utils/images';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import ReplyTemplatesSheet from './ReplyTemplatesSheet';
import { displayName, progressLabel } from './queueFormat';

type Props = {
  visible: boolean;
  onClose: (reviewed: number) => void;
  templates: string[];
  onTemplatesChange?: (t: string[]) => void;
};

const SEEN_TEXT = 'Seen 👍';

/**
 * Batch review: one finished homework or shared proof at a time. Reply with a saved
 * quick reply, tap "Seen 👍", or skip. Homework replies are coach feedback; proof
 * replies go as a DM and mark the proof seen.
 */
export default function ReviewSwiper({ visible, onClose, templates, onTemplatesChange }: Props) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setItems(null);
    setIndex(0);
    setReviewed(0);
    setError(null);
    let alive = true;
    getReviewItems()
      .then((res) => alive && setItems(res?.items ?? []))
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Could not load');
        setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const item = items && index < items.length ? items[index] : null;
  const total = items?.length ?? 0;

  const next = () => setIndex((i) => i + 1);

  const respond = async (text: string) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      if (item.type === 'homework' && item.homework) {
        // Feedback also marks the homework's proofs as seen on the server.
        await sendHomeworkFeedback(item.homework.id, text);
      } else {
        await Promise.all(item.proofs.map((p) => markProofSeen(p.id)));
        if (text !== SEEN_TEXT) await sendQuickDm(item.client.id, text);
      }
      feedback.send();
      setReviewed((n) => n + 1);
      setMoreOpen(false);
      next();
    } catch (e) {
      feedback.error();
      void alertMessage('Review', e instanceof Error ? e.message : 'Could not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (reviewed) toast.success(`${reviewed} reviewed`);
    onClose(reviewed);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-gutter pt-3 pb-2`}>
          <PressableScale
            onPress={close}
            feedback="close"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close review"
            style={tw`w-9 h-9 rounded-full bg-raised border border-line/80 items-center justify-center`}
          >
            <Ionicons name="close" size={18} color={theme.colors.ink} />
          </PressableScale>
          <Text style={tw`text-callout font-bold text-ink`}>Review</Text>
          <Text style={tw`text-footnote text-ink-3 w-16 text-right`} accessibilityLiveRegion="polite">
            {item ? progressLabel(index, total) : ''}
          </Text>
        </View>
        {total > 0 ? (
          <View style={tw`h-1 mx-gutter rounded-full bg-raised overflow-hidden`}>
            <View style={[tw`h-1 bg-emerald-600`, { width: `${Math.min(100, (index / total) * 100)}%` }]} />
          </View>
        ) : null}

        {items === null ? (
          <View style={tw`flex-1 items-center justify-center`}>
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        ) : !item ? (
          <View style={tw`flex-1 justify-center`}>
            <EmptyState
              icon="checkmark-done-outline"
              title={error ? 'Couldn’t load reviews' : total ? 'All caught up' : 'Nothing to review'}
              description={
                error ||
                (total
                  ? `You went through ${total}. Nice work.`
                  : 'Finished homework and shared proofs will show up here.')
              }
              actionLabel="Done"
              onAction={close}
            />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={tw`px-gutter pt-4 pb-4`}>
              <FadeInUp key={item.id}>
                <ReviewCard item={item} />
              </FadeInUp>
            </ScrollView>

            <View style={tw`px-gutter pb-3 pt-2 border-t border-line/70`}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={tw`py-1`}
              >
                {templates.slice(0, 8).map((t) => (
                  <PressableScale
                    key={t}
                    onPress={() => void respond(t)}
                    disabled={busy}
                    feedback="chip"
                    accessibilityRole="button"
                    accessibilityLabel={`Reply: ${t}`}
                    style={tw`mr-2 px-3 py-2 rounded-chip bg-raised border border-line max-w-[240px]`}
                  >
                    <Text style={tw`text-footnote font-semibold text-ink-2`} numberOfLines={1}>
                      {t}
                    </Text>
                  </PressableScale>
                ))}
                <PressableScale
                  onPress={() => setMoreOpen(true)}
                  disabled={busy}
                  feedback="open"
                  accessibilityRole="button"
                  accessibilityLabel="Write or edit replies"
                  style={tw`mr-2 px-3 py-2 rounded-chip bg-raised border border-line flex-row items-center`}
                >
                  <Ionicons name="create-outline" size={14} color={theme.colors.ink2} />
                  <Text style={tw`text-footnote font-semibold text-ink-2 ml-1`}>Write…</Text>
                </PressableScale>
              </ScrollView>
              <View style={tw`flex-row mt-2`}>
                <PressableScale
                  onPress={() => {
                    feedback.tap();
                    next();
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Skip for now"
                  style={tw`flex-1 mr-2 py-3.5 rounded-card bg-raised border border-line items-center`}
                >
                  <Text style={tw`text-ink-2 font-bold`}>Skip</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => void respond(SEEN_TEXT)}
                  disabled={busy}
                  feedback={false}
                  accessibilityRole="button"
                  accessibilityLabel="Mark seen"
                  style={[
                    tw`py-3.5 rounded-card bg-emerald-600 items-center flex-row justify-center ${busy ? 'opacity-60' : ''}`,
                    { flex: 2 },
                  ]}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={tw`text-white font-bold`}>{SEEN_TEXT}</Text>}
                </PressableScale>
              </View>
            </View>
          </>
        )}
      </SafeAreaView>

      <ReplyTemplatesSheet
        visible={moreOpen}
        recipient={item ? displayName(item.client) : null}
        initial={templates}
        onTemplatesChange={onTemplatesChange}
        onClose={() => setMoreOpen(false)}
        onPick={(t) => respond(t)}
      />
    </Modal>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const name = displayName(item.client);
  const hw = item.homework;
  const mediaProof = item.proofs.find((p) => !!p.media_url);
  const otherProofs = item.proofs.filter((p) => p !== mediaProof);
  return (
    <View style={tw`rounded-card bg-card border border-line/80 overflow-hidden`}>
      <View style={tw`flex-row items-center px-4 pt-4`}>
        <GrowAvatar userId={item.client.id} username={item.client.username} uri={item.client.avatar_url} size={36} />
        <View style={tw`ml-3 flex-1`}>
          <Text style={tw`text-callout font-bold text-ink`} numberOfLines={1}>
            {name}
          </Text>
          <Text style={tw`text-caption text-ink-3`}>{hw ? 'Finished homework' : 'Shared a proof'}</Text>
        </View>
      </View>
      {hw ? (
        <View style={tw`px-4 pt-3`}>
          <Text style={tw`text-title font-bold text-ink`}>{hw.title}</Text>
          {hw.proof_kind && !item.proofs.length ? (
            <Text style={tw`text-footnote text-ink-3 mt-1`}>Done without the {hw.proof_kind} you asked for — that’s okay.</Text>
          ) : null}
        </View>
      ) : null}

      {mediaProof ? (
        <View style={tw`mt-3 mx-4 h-64 rounded-control overflow-hidden bg-raised`}>
          <ProofMedia proof={mediaProof} style={tw`w-full h-full`} accessibilityLabel={`Proof from ${name}`} />
        </View>
      ) : hw?.photo_url ? (
        <Image
          source={{ uri: resolvePostMediaUri(hw.photo_url) }}
          style={tw`mt-3 mx-4 h-64 rounded-control bg-raised`}
          contentFit="cover"
          accessibilityLabel={`Photo from ${name}`}
        />
      ) : null}

      <View style={tw`px-4 pt-3 pb-4`}>
        {[mediaProof, ...otherProofs].filter(Boolean).map((p) => {
          const summary = proofSummary(p!);
          return summary ? (
            <View key={p!.id} style={tw`flex-row items-center mb-1.5`}>
              <Ionicons name="checkmark-circle" size={14} color={tw.color('emerald-600')} />
              <Text style={tw`text-body text-ink-2 ml-1.5 flex-1`}>{summary}</Text>
            </View>
          ) : null;
        })}
        {hw?.note ? (
          <View style={tw`mt-1 px-3 py-2 rounded-control bg-page`}>
            <Text style={tw`text-caption font-bold tracking-widest text-ink-3 uppercase`}>Client note</Text>
            <Text style={tw`text-body text-ink-2 mt-0.5 leading-5`}>{hw.note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
