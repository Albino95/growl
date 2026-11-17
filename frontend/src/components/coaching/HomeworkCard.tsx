import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import type { CoachingAssignment } from '../../services/api/instructor';
import { getSeed } from '../../services/api/seeds';
import { resolvePostMediaUri } from '../../utils/images';
import { formatHomeworkDate, isOverdue } from './homeworkDates';
import ProofMedia from '../proof/ProofMedia';
import { KIND_META, proofSummary } from '../proof/proofDefaults';
import type { AssignmentWithProof } from '../../services/api/coachq';

type Props = {
  item: CoachingAssignment;
  isCoach: boolean;
  /** Client on an active plan can mark open homework done. */
  canMarkDone: boolean;
  onMarkDone: (item: CoachingAssignment) => void;
  /** Coach: open the feedback sheet for this homework. */
  onFeedback?: (item: CoachingAssignment) => void;
};

type Extra = { detail: string | null; lastNote: string | null };

/**
 * Coaching homework rendered inline on the plan (no Garden / seed screens).
 * Detail and the latest note come from the homework's backing record.
 */
export default function HomeworkCard({ item, isCoach, canMarkDone, onMarkDone, onFeedback }: Props) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const done = item.status === 'done';
  const asked = (item as AssignmentWithProof).proof_kind ?? null;
  const proofs = (item as AssignmentWithProof).proofs ?? [];
  const mediaProof = proofs.find((p) => !!p.media_url);

  useEffect(() => {
    let alive = true;
    if (!item.seed_id) return undefined;
    getSeed(item.seed_id)
      .then((res) => {
        if (!alive) return;
        const withNote = (res.activity || []).find((a) => !!a.note?.trim());
        setExtra({
          detail: res.seed?.goal_detail?.trim() || null,
          lastNote: withNote?.note?.trim() || null,
        });
      })
      .catch(() => {
        /* detail is a nice-to-have; the row still shows title + status */
      });
    return () => {
      alive = false;
    };
  }, [item.seed_id, item.last_activity_at]);

  const due = formatHomeworkDate(item.due_at);
  const overdue = !done && isOverdue(item.due_at);
  const completed = done ? formatHomeworkDate(item.completed_at) : null;
  const lastActivity = !done ? formatHomeworkDate(item.last_activity_at) : null;

  return (
    <View
      style={tw`mb-2.5 px-3.5 py-3 rounded-card bg-card border ${
        done ? 'border-emerald-200' : 'border-line/80'
      }`}
      accessible={!(canMarkDone && !done) && !(isCoach && done && onFeedback)}
      accessibilityLabel={`${item.title}. ${done ? 'Done' : 'To do'}${due ? `. Due ${due}` : ''}`}
    >
      <View style={tw`flex-row items-center justify-between`}>
        <Text style={tw`font-bold text-ink flex-1`} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={tw`ml-2 px-2 py-0.5 rounded-full flex-row items-center ${done ? 'bg-emerald-50' : 'bg-raised'}`}>
          {done ? <Ionicons name="checkmark" size={11} color={tw.color('emerald-800')} style={tw`mr-0.5`} /> : null}
          <Text style={tw`text-caption font-semibold ${done ? 'text-emerald-800' : 'text-ink-2'}`}>
            {done ? 'Done' : 'To do'}
          </Text>
        </View>
      </View>

      {extra?.detail ? (
        <Text style={tw`text-sm text-ink-2 mt-1 leading-5`}>{extra.detail}</Text>
      ) : null}

      {asked ? (
        <View
          style={tw`self-start mt-1.5 px-2 py-0.5 rounded-chip bg-raised border border-line flex-row items-center`}
          accessibilityLabel={`${isCoach ? 'You asked for' : 'Your coach asks for'} a ${KIND_META[asked].label.toLowerCase()} as proof`}
        >
          <Ionicons
            name={KIND_META[asked].icon as keyof typeof Ionicons.glyphMap}
            size={11}
            color={tw.color('emerald-700')}
            style={tw`mr-1`}
          />
          <Text style={tw`text-caption font-semibold text-ink-2`}>
            {isCoach ? 'Proof asked' : 'Coach asks for'}: {KIND_META[asked].label}
          </Text>
        </View>
      ) : null}

      <Text style={tw`text-xs mt-1 ${overdue ? 'text-rose-600' : 'text-ink-3'}`}>
        {[
          due ? `${overdue ? 'Overdue · was due' : 'Due'} ${due}` : null,
          completed ? `Done ${completed}` : null,
          lastActivity ? `Last update ${lastActivity}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || (done ? 'Done' : 'No due date')}
      </Text>

      {mediaProof ? (
        <ProofMedia
          proof={mediaProof}
          style={tw`w-full h-36 rounded-control mt-2 overflow-hidden`}
          accessibilityLabel={isCoach ? 'Proof from your client' : 'Your proof'}
        />
      ) : null}
      {proofs.length ? (
        <View style={tw`mt-1.5`}>
          {proofs.map((p) => (
            <View key={p.id} style={tw`flex-row items-center mt-0.5`}>
              <Ionicons name="checkmark-circle" size={13} color={tw.color('emerald-600')} />
              <Text style={tw`text-xs text-ink-2 ml-1 flex-1`} numberOfLines={2}>
                With proof · {proofSummary(p)}
                {isCoach && p.seen_by_coach_at ? ' · Seen ✓' : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {item.last_photo && !mediaProof ? (
        <Image
          source={{ uri: resolvePostMediaUri(item.last_photo) }}
          style={tw`w-full h-36 rounded-control mt-2 bg-raised`}
          contentFit="cover"
          accessibilityLabel={isCoach ? 'Photo from your client' : 'Your photo'}
        />
      ) : null}

      {extra?.lastNote ? (
        <View style={tw`mt-2 px-3 py-2 rounded-control bg-page`}>
          <Text style={tw`text-caption font-bold tracking-widest text-ink-3 uppercase`}>
            {isCoach ? 'Client note' : 'Your note'}
          </Text>
          <Text style={tw`text-sm text-ink-2 mt-0.5 leading-5`}>{extra.lastNote}</Text>
        </View>
      ) : null}

      {canMarkDone && !done ? (
        <PressableScale
          onPress={() => onMarkDone(item)}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${item.title} done`}
          style={tw`mt-2.5 py-2.5 rounded-control bg-emerald-600 flex-row items-center justify-center gap-1.5`}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
          <Text style={tw`text-white font-bold text-sm`}>
            {asked ? `Mark done · add ${KIND_META[asked].label.toLowerCase()}` : 'Mark done'}
          </Text>
        </PressableScale>
      ) : null}

      {item.coach_feedback ? (
        <View style={tw`mt-2 px-3 py-2 rounded-control bg-emerald-50 border border-emerald-100`}>
          <Text style={tw`text-caption font-bold tracking-widest text-emerald-800 uppercase`}>
            {isCoach ? 'Your feedback' : 'Coach feedback'}
          </Text>
          <Text style={tw`text-sm text-ink mt-0.5 leading-5`}>{item.coach_feedback}</Text>
        </View>
      ) : null}

      {isCoach && !done ? (
        <Text style={tw`text-xs text-ink-3 mt-1.5`}>
          Waiting for your client to mark this done.
        </Text>
      ) : null}

      {isCoach && done && onFeedback ? (
        <PressableScale
          onPress={() => onFeedback(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.coach_feedback ? 'Edit' : 'Give'} feedback on ${item.title}`}
          style={tw`mt-2.5 py-2.5 rounded-control bg-raised border border-line flex-row items-center justify-center gap-1.5`}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={tw.color('emerald-700')} />
          <Text style={tw`text-ink font-bold text-sm`}>
            {item.coach_feedback ? 'Edit feedback' : 'Give feedback'}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
