import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { SkeletonList } from '../ui/SkeletonCard';
import { horizontalScrollProps } from '../../constants/scroll';
import { getCategoryLabel } from '../../utils/categoryLabels';
import { feedback } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';
import { getChallenges, joinChallenge, type ChallengeSummary } from '../../services/api/growth';
import ChallengeProgressBar from './ChallengeProgressBar';
import { consumeChallengesDirty, formatDaysLeft } from './challengeUtils';

type Props = {
  /** Top-level path filter (e.g. `fitness`); null = all challenges. */
  path?: string | null;
  /** Bump to force a reload (Explore pull-to-refresh). */
  refreshKey?: number;
  onOpen: (challengeId: string) => void;
};

const STALE_MS = 45_000;

/** Explore "Challenges" row: horizontal cards with inline Join. */
export default function ChallengesStrip({ path, refreshKey = 0, onOpen }: Props) {
  const topPath = path ? path.split(':')[0] : null;
  const [items, setItems] = useState<ChallengeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const lastLoadRef = useRef(0);
  const seqRef = useRef(0);
  const pathRef = useRef(topPath);
  pathRef.current = topPath;

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    lastLoadRef.current = Date.now();
    try {
      const res = await getChallenges(pathRef.current || undefined);
      if (seq !== seqRef.current) return;
      setItems(Array.isArray(res?.challenges) ? res.challenges : []);
    } catch {
      // Endpoint may not be live yet — keep what we had; an empty list hides the section.
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // Path change or explicit refresh → reload.
  useEffect(() => {
    void load();
  }, [load, topPath, refreshKey]);

  // Focus → reload only when stale or a join/leave happened elsewhere.
  useFocusEffect(
    useCallback(() => {
      const dirty = consumeChallengesDirty();
      if (!dirty && Date.now() - lastLoadRef.current < STALE_MS) return;
      void load();
    }, [load])
  );

  const join = async (c: ChallengeSummary) => {
    if (joiningId) return;
    setJoiningId(c.id);
    feedback.commit();
    try {
      const detail = await joinChallenge(c.id);
      setItems((prev) =>
        prev.map((it) =>
          it.id === c.id
            ? {
                ...it,
                joined: true,
                progress: detail?.progress ?? 0,
                ends_at: detail?.ends_at ?? it.ends_at,
                completed: !!detail?.completed,
                participants: it.joined ? it.participants : it.participants + 1,
              }
            : it
        )
      );
      feedback.success();
    } catch (e) {
      feedback.error();
      void alertMessage(
        'Couldn’t join just now',
        e instanceof Error && e.message ? e.message : 'Please try again in a moment.'
      );
    } finally {
      setJoiningId(null);
    }
  };

  if (!loading && items.length === 0) return null;

  return (
    <View style={tw`mb-5`}>
      <View style={tw`flex-row items-end justify-between mb-1 mt-1`}>
        <Text style={tw`text-xs font-semibold tracking-widest text-ink-3 uppercase`}>
          {topPath ? `Challenges · ${getCategoryLabel(topPath)}` : 'Challenges'}
        </Text>
      </View>
      <Text style={tw`text-sm text-ink-3 mb-3`}>
        Small, doable streaks on a path. Friends can join you.
      </Text>
      {loading && items.length === 0 ? (
        <SkeletonList variant="inbox" count={1} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} {...horizontalScrollProps}>
          {items.map((c) => {
            const left = c.joined ? formatDaysLeft(c.ends_at) : null;
            return (
              <PressableScale
                key={c.id}
                onPress={() => {
                  feedback.open();
                  onOpen(c.id);
                }}
                style={tw`w-56 mr-3 p-4 rounded-sheet bg-card border ${
                  c.completed ? 'border-energy-600/40' : c.joined ? 'border-emerald-200' : 'border-line/80'
                }`}
                accessibilityRole="button"
                accessibilityLabel={`${c.title} challenge, ${c.participants} joined${
                  c.joined ? `, ${c.progress} of ${c.target_days} days` : ''
                }`}
              >
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`w-11 h-11 rounded-card bg-emerald-50 items-center justify-center`}>
                    <Text style={tw`text-2xl`}>{c.emoji || '🌱'}</Text>
                  </View>
                  <Text style={tw`text-caption font-semibold text-ink-3`}>
                    {c.participants === 1 ? '1 joined' : `${c.participants} joined`}
                  </Text>
                </View>
                <Text style={tw`mt-3 text-base font-bold text-ink`} numberOfLines={2}>
                  {c.title}
                </Text>
                <Text style={tw`mt-0.5 text-xs text-ink-3`} numberOfLines={1}>
                  {getCategoryLabel(c.path)} · {c.target_days} of {c.duration_days} days
                </Text>

                {c.joined ? (
                  <View style={tw`mt-3`}>
                    <ChallengeProgressBar progress={c.progress} target={c.target_days} completed={c.completed} />
                    <Text style={tw`mt-1.5 text-xs font-semibold ${c.completed ? 'text-bloom-ink' : 'text-emerald-700'}`}>
                      {c.completed
                        ? 'Finished 🌳'
                        : `${c.progress}/${c.target_days} days${left ? ` · ${left}` : ''}`}
                    </Text>
                  </View>
                ) : (
                  <PressableScale
                    onPress={() => void join(c)}
                    disabled={joiningId === c.id}
                    style={tw`mt-3 self-start px-4 py-2 rounded-full bg-emerald-600`}
                    accessibilityRole="button"
                    accessibilityLabel={`Join ${c.title}`}
                  >
                    {joiningId === c.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={tw`text-sm font-bold text-white`}>Join</Text>
                    )}
                  </PressableScale>
                )}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
