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

type Props = {
  item: CoachingAssignment;
  isCoach: boolean;
  /** Client on an active plan can mark open homework done. */
  canMarkDone: boolean;
  onMarkDone: (item: CoachingAssignment) => void;
};

type Extra = { detail: string | null; lastNote: string | null };

/**
 * Coaching homework rendered inline on the plan (no Garden / seed screens).
 * Detail and the latest note come from the homework's backing record.
 */
export default function HomeworkCard({ item, isCoach, canMarkDone, onMarkDone }: Props) {
  const [extra, setExtra] = useState<Extra | null>(null);
  const done = item.status === 'done';

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
      style={tw`mb-2.5 px-3.5 py-3 rounded-2xl bg-[#FFFcf7] border ${
        done ? 'border-emerald-200' : 'border-stone-200/80'
      }`}
      accessible={!canMarkDone || done}
      accessibilityLabel={`${item.title}. ${done ? 'Done' : 'To do'}${due ? `. Due ${due}` : ''}`}
    >
      <View style={tw`flex-row items-center justify-between`}>
        <Text style={tw`font-bold text-stone-900 flex-1`} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={tw`ml-2 px-2 py-0.5 rounded-full flex-row items-center ${done ? 'bg-emerald-50' : 'bg-[#EAE4D6]'}`}>
          {done ? <Ionicons name="checkmark" size={11} color="#065F46" style={tw`mr-0.5`} /> : null}
          <Text style={tw`text-[11px] font-semibold ${done ? 'text-emerald-800' : 'text-stone-600'}`}>
            {done ? 'Done' : 'To do'}
          </Text>
        </View>
      </View>

      {extra?.detail ? (
        <Text style={tw`text-sm text-stone-600 mt-1 leading-5`}>{extra.detail}</Text>
      ) : null}

      <Text style={tw`text-xs mt-1 ${overdue ? 'text-[#E11D48]' : 'text-stone-500'}`}>
        {[
          due ? `${overdue ? 'Overdue · was due' : 'Due'} ${due}` : null,
          completed ? `Done ${completed}` : null,
          lastActivity ? `Last update ${lastActivity}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || (done ? 'Done' : 'No due date')}
      </Text>

      {item.last_photo ? (
        <Image
          source={{ uri: resolvePostMediaUri(item.last_photo) }}
          style={tw`w-full h-36 rounded-xl mt-2 bg-[#EAE4D6]`}
          contentFit="cover"
          accessibilityLabel={isCoach ? 'Photo from your client' : 'Your photo'}
        />
      ) : null}

      {extra?.lastNote ? (
        <View style={tw`mt-2 px-3 py-2 rounded-xl bg-[#F3EEE4]`}>
          <Text style={tw`text-[10px] font-bold tracking-widest text-stone-400 uppercase`}>
            {isCoach ? 'Client note' : 'Your note'}
          </Text>
          <Text style={tw`text-sm text-stone-700 mt-0.5 leading-5`}>{extra.lastNote}</Text>
        </View>
      ) : null}

      {canMarkDone && !done ? (
        <PressableScale
          onPress={() => onMarkDone(item)}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${item.title} done`}
          style={tw`mt-2.5 py-2.5 rounded-xl bg-emerald-600 flex-row items-center justify-center gap-1.5`}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
          <Text style={tw`text-white font-bold text-sm`}>Mark done</Text>
        </PressableScale>
      ) : null}

      {isCoach && !done ? (
        <Text style={tw`text-xs text-stone-400 mt-1.5`}>
          Waiting for your client to mark this done.
        </Text>
      ) : null}
    </View>
  );
}
