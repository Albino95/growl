import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  ActivityIndicator,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import WeekDots from '../recap/WeekDots';
import {
  CHECKIN_MOODS,
  FOLLOWUP_OPTIONS,
  checkinMoodMeta,
  firstNameOf,
  followupReply,
  isEvening,
  isStreakMilestone,
  moodReply,
  streakLabel,
  topLevelPaths,
  welcomeBackLine,
  type Followup,
} from '../recap/growthMeta';
import { journalMoodFromCheckin, localDateKey } from '../journal/journalMeta';
import { useGrowthStore } from '../../state/useGrowthStore';
import { useActivationStore } from '../../state/useActivationStore';
import { useAuth } from '../../store/hooks';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { triggerFeedback } from '../../utils/interactionFeedback';
import { getTimeOfDayGreeting } from '../../utils/greeting';
import { getCategoryMeta } from '../../utils/categoryLabels';
import CATEGORIES from '../../data/categories';
import type { Mood } from '../../services/api/growth';

if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Phase = 'form' | 'reply' | 'pill';

const REPLY_HOLD_MS = 2400;
const INTENTION_MAX = 140;

function pathLabel(key: string | null | undefined): string {
  if (!key) return '';
  return getCategoryMeta(key).parentLabel;
}

/**
 * Home "Today" check-in: mood → path → optional intention → Done, then a calm
 * pill. Reads/writes `useGrowthStore`; renders nothing until the server answers
 * (or at all if the growth API is unavailable).
 */
function TodayCard() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();

  const streak = useGrowthStore((s) => s.streak);
  const checkin = useGrowthStore((s) => s.checkin);
  const available = useGrowthStore((s) => s.available);
  const loaded = useGrowthStore((s) => s.loaded);
  const saving = useGrowthStore((s) => s.saving);

  const lastJournalDateKey = useActivationStore((s) => s.lastJournalDateKey);
  const journaledToday = lastJournalDateKey === localDateKey();
  const sundaySit = useActivationStore((s) => s.showSundaySit());

  const [phase, setPhase] = useState<Phase>(checkin ? 'pill' : 'form');
  const [editing, setEditing] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [intention, setIntention] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restNote, setRestNote] = useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [followupLine, setFollowupLine] = useState<string | null>(null);

  const moodScales = useRef(CHECKIN_MOODS.map(() => new Animated.Value(1))).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const checkPop = useRef(new Animated.Value(1)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  // Coming back to the app (maybe on a new day) → re-check today (throttled in the store).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useGrowthStore.getState().refresh();
    });
    return () => sub.remove();
  }, []);

  const animateLayout = useCallback(() => {
    if (reduceMotion) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
  }, [reduceMotion]);

  // Keep phase in sync with the server (new day → form; check-in from elsewhere → pill).
  useEffect(() => {
    if (!checkin) {
      if (phase !== 'form') setPhase('form');
      setEditing(false);
      return;
    }
    if (phase === 'form' && !editing && !saving) setPhase('pill');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin]);

  const paths = useMemo(() => {
    const own = topLevelPaths(user?.categories);
    return own.length > 0 ? own : CATEGORIES.slice(0, 6).map((c) => c.key);
  }, [user?.categories]);

  const firstName = useMemo(() => firstNameOf(user?.username), [user?.username]);
  const greeting = `${getTimeOfDayGreeting(firstName || undefined)}.`;

  const runReveal = useCallback(() => {
    if (reduceMotion) {
      reveal.setValue(1);
      return;
    }
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [reduceMotion, reveal]);

  const onMood = (value: Mood, index: number) => {
    triggerFeedback('select');
    setError(null);
    const first = mood == null;
    setMood(value);
    if (!reduceMotion) {
      const s = moodScales[index];
      s.setValue(1);
      Animated.sequence([
        Animated.spring(s, { toValue: 1.15, useNativeDriver: true, speed: 40, bounciness: 8 }),
        Animated.spring(s, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 8 }),
      ]).start();
    }
    if (first) runReveal();
  };

  const onPath = (key: string) => {
    triggerFeedback('select');
    setPath((cur) => (cur === key ? null : key));
  };

  const popCheck = useCallback(() => {
    if (reduceMotion) {
      checkPop.setValue(1);
      return;
    }
    checkPop.setValue(0.4);
    Animated.spring(checkPop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [reduceMotion, checkPop]);

  const onDone = async () => {
    if (!mood || saving) return;
    triggerFeedback('commit');
    setError(null);
    try {
      const trimmed = intention.trim().slice(0, INTENTION_MAX);
      const res = await useGrowthStore.getState().saveCheckin({
        mood,
        path: path ?? null,
        intention: trimmed || null,
      });
      const awarded = res.points_awarded || 0;
      setPointsAwarded(awarded);
      if (awarded > 0 && isStreakMilestone(res.streak?.current ?? 0)) {
        triggerFeedback('celebrate');
      }
      setEditing(false);
      setExpanded(false);
      animateLayout();
      setPhase('reply');
      popCheck();
      timers.current.push(
        setTimeout(() => {
          animateLayout();
          setPhase('pill');
        }, REPLY_HOLD_MS)
      );
    } catch {
      triggerFeedback('warn');
      setError('Couldn’t save just now. Tap Done to try again.');
    }
  };

  const restLeft = streak?.rest_days_left ?? 0;

  const onRest = async () => {
    if (saving) return;
    if (restLeft <= 0) {
      setRestNote('No rest days left right now — one refills after 7 active days. Any small step counts today.');
      return;
    }
    triggerFeedback('commit');
    setRestNote(null);
    setError(null);
    try {
      await useGrowthStore.getState().saveCheckin({ rest: true });
      animateLayout();
      setEditing(false);
      setPhase('pill');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/rest/i.test(msg)) {
        setRestNote('No rest days left right now — one refills after 7 active days. Any small step counts today.');
        void useGrowthStore.getState().refresh({ force: true });
      } else {
        setError('Couldn’t save just now. Try again in a moment.');
      }
    }
  };

  const onEdit = () => {
    triggerFeedback('tap');
    setMood(checkin?.mood ?? null);
    setPath(checkin?.path ?? null);
    setIntention(checkin?.intention ?? '');
    reveal.setValue(checkin?.mood ? 1 : 0);
    setEditing(true);
    animateLayout();
    setPhase('form');
  };

  const onWriteMore = () => {
    triggerFeedback('open');
    useGrowthStore.getState().setComposeDraft({
      mood: journalMoodFromCheckin(checkin?.mood ?? null),
      path: checkin?.path ?? null,
      intention: checkin?.intention ?? null,
    });
    navigation.navigate('Journal', { openCompose: true });
  };

  const onTogglePill = () => {
    triggerFeedback('toggle');
    animateLayout();
    setExpanded((v) => !v);
  };

  const onFollowup = async (value: Followup) => {
    if (!checkin || saving) return;
    triggerFeedback(value === 'yes' ? 'success' : 'select');
    try {
      await useGrowthStore.getState().saveCheckin({
        ...(checkin.mood ? { mood: checkin.mood } : {}),
        path: checkin.path,
        intention: checkin.intention,
        followup: value,
      });
      animateLayout();
      setFollowupLine(followupReply(value));
    } catch {
      setError('Couldn’t save just now. Try again in a moment.');
    }
  };

  if (!loaded || !available || !streak) return null;

  const current = streak.current ?? 0;
  const welcomeBack = welcomeBackLine(current, streak.longest ?? 0);
  const revealStyle = {
    opacity: reveal,
    transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  // ---------- Rest day ----------
  if (checkin?.rest && phase !== 'form') {
    return (
      <View style={tw`mx-4 mb-3 px-4 py-3.5 rounded-2xl bg-emerald-50 border border-emerald-100`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-[15px] font-semibold text-emerald-900 flex-1 pr-3`}>
            Rest is part of growing. Your streak is safe 🌿
          </Text>
          <WeekDots days={streak.week} size={8} />
        </View>
        <Text style={tw`text-xs text-emerald-800/80 mt-1`}>
          {current > 0 ? `${streakLabel(current)} · ` : ''}See you tomorrow.
        </Text>
      </View>
    );
  }

  // ---------- Reply (just saved) ----------
  if (phase === 'reply' && checkin) {
    return (
      <View
        style={tw`mx-4 mb-3 px-4 py-4 rounded-2xl bg-[#FFFcf7] border border-emerald-200/80`}
        accessibilityLiveRegion="polite"
      >
        <View style={tw`flex-row items-center`}>
          <Animated.View
            style={[
              tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`,
              { transform: [{ scale: checkPop }] },
            ]}
          >
            <Ionicons name="checkmark" size={20} color="#fff" />
          </Animated.View>
          <View style={tw`flex-1`}>
            <Text style={tw`text-[15px] font-semibold text-stone-900 leading-5`}>
              {moodReply(checkin.mood)}
            </Text>
            <Text style={tw`text-xs font-semibold text-[#E0584E] mt-1`}>
              {pointsAwarded > 0 ? `+${pointsAwarded} · ` : ''}
              {streakLabel(current)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ---------- Checked in (pill) ----------
  if (phase === 'pill' && checkin) {
    const showFollowup =
      isEvening() && !!checkin.intention && !checkin.followup && !checkin.rest;
    const label = pathLabel(checkin.path);
    const moodMeta = checkinMoodMeta(checkin.mood);
    const doneFollowup = followupLine || followupReply(checkin.followup);
    return (
      <View style={tw`mx-4 mb-3`}>
        <PressableScale
          feedback={false}
          onPress={onTogglePill}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`Checked in. ${streakLabel(current)}${label ? `. ${label}` : ''}`}
          style={tw`flex-row items-center px-3.5 py-2.5 rounded-full bg-emerald-50 border border-emerald-100`}
        >
          <View style={tw`w-5 h-5 rounded-full bg-emerald-600 items-center justify-center mr-2`}>
            <Ionicons name="checkmark" size={13} color="#fff" />
          </View>
          <Text style={tw`flex-1 text-[13px] font-semibold text-emerald-900`} numberOfLines={1}>
            Checked in · {streakLabel(current)}
            {label ? ` · ${label}` : ''}
          </Text>
          <WeekDots days={streak.week} size={7} />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#047857"
            style={tw`ml-2`}
          />
        </PressableScale>

        {showFollowup && !followupLine ? (
          <View style={tw`mt-2 px-4 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/70`}>
            <Text style={tw`text-[14px] font-semibold text-stone-900`}>
              {label ? `Did you grow in ${label} today?` : 'Did you take that small step today?'}
            </Text>
            <Text style={tw`text-xs text-stone-500 mt-0.5`} numberOfLines={2}>
              “{checkin.intention}”
            </Text>
            <View style={tw`flex-row gap-2 mt-2.5`}>
              {FOLLOWUP_OPTIONS.map((o) => (
                <PressableScale
                  key={o.value}
                  feedback={false}
                  disabled={saving}
                  onPress={() => void onFollowup(o.value)}
                  accessibilityRole="button"
                  style={tw`flex-1 py-2 rounded-full items-center ${
                    o.value === 'yes' ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                  }`}
                >
                  <Text
                    style={tw`text-[13px] font-semibold ${o.value === 'yes' ? 'text-white' : 'text-stone-800'}`}
                  >
                    {o.label}
                  </Text>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        {followupLine && !expanded ? (
          <Text style={tw`text-xs text-emerald-800 mt-2 px-2`}>{followupLine}</Text>
        ) : null}

        {expanded ? (
          <View style={tw`mt-2 px-4 py-3 rounded-2xl bg-[#FFFcf7] border border-stone-200/70`}>
            {moodMeta ? (
              <Text style={tw`text-xs text-stone-500`}>
                Arrived feeling {moodMeta.glyph} {moodMeta.label.toLowerCase()}
              </Text>
            ) : null}
            {checkin.intention ? (
              <Text style={tw`text-[15px] text-stone-900 mt-1 leading-5`}>“{checkin.intention}”</Text>
            ) : (
              <Text style={tw`text-sm text-stone-500 mt-1`}>No intention today — that’s fine.</Text>
            )}
            {doneFollowup ? (
              <Text style={tw`text-xs text-emerald-800 mt-1.5`}>{doneFollowup}</Text>
            ) : null}
            <View style={tw`flex-row gap-2 mt-3`}>
              <PressableScale
                feedback={false}
                onPress={onWriteMore}
                accessibilityRole="button"
                style={tw`flex-1 py-2.5 rounded-xl bg-emerald-600 items-center flex-row justify-center gap-1.5`}
              >
                <Ionicons name="book-outline" size={15} color="#fff" />
                <Text style={tw`text-white font-semibold text-[13px]`}>Write more</Text>
              </PressableScale>
              <PressableScale
                feedback={false}
                onPress={onEdit}
                accessibilityRole="button"
                style={tw`px-4 py-2.5 rounded-xl bg-[#EAE4D6] items-center`}
              >
                <Text style={tw`text-stone-800 font-semibold text-[13px]`}>Edit</Text>
              </PressableScale>
            </View>
          </View>
        ) : !journaledToday && !showFollowup ? (
          // Former HomeSitCue: one quiet journal nudge, only after the check-in.
          <PressableScale
            feedback={false}
            onPress={onWriteMore}
            accessibilityRole="button"
            style={tw`mt-2 flex-row items-center px-3.5 py-2.5 rounded-2xl ${
              sundaySit ? 'bg-[#FFF1F0] border border-[#FECACA]/80' : 'bg-[#FFFcf7] border border-stone-200/70'
            }`}
          >
            <Ionicons
              name={sundaySit ? 'sunny-outline' : 'book-outline'}
              size={16}
              color={sundaySit ? '#E0584E' : '#059669'}
            />
            <Text style={tw`flex-1 ml-2 text-[13px] text-stone-700`} numberOfLines={1}>
              {sundaySit ? 'Sunday sit — a quiet page for the week' : 'Write more about today, privately'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#A8A29E" />
          </PressableScale>
        ) : null}
        {error ? <Text style={tw`text-xs text-stone-500 mt-1.5 px-2`}>{error}</Text> : null}
      </View>
    );
  }

  // ---------- Form (not done yet / editing) ----------
  return (
    <View style={tw`mx-4 mb-3 px-4 pt-4 pb-3.5 rounded-3xl bg-[#FFFcf7] border border-stone-200/70`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Text style={tw`text-[17px] font-bold text-stone-900`}>{greeting}</Text>
          <Text style={tw`text-sm text-stone-500 mt-0.5`}>
            {editing ? 'Update today’s check-in.' : 'How are you arriving today?'}
          </Text>
        </View>
        <View style={tw`items-end pt-1`}>
          <WeekDots days={streak.week} size={8} />
          {current > 0 ? (
            <Text style={tw`text-[10px] font-semibold text-[#E0584E] mt-1`}>{streakLabel(current)}</Text>
          ) : null}
        </View>
      </View>

      {welcomeBack && !editing ? (
        <Text style={tw`text-xs text-emerald-800 mt-2 leading-4`}>{welcomeBack}</Text>
      ) : null}

      <View style={tw`flex-row justify-between mt-3`}>
        {CHECKIN_MOODS.map((m, i) => {
          const selected = mood === m.mood;
          return (
            <Animated.View key={m.mood} style={{ transform: [{ scale: moodScales[i] }] }}>
              <PressableScale
                feedback={false}
                pressedScale={0.94}
                onPress={() => onMood(m.mood, i)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Mood: ${m.label}`}
                style={tw`items-center px-2 py-2 rounded-2xl min-w-[56px] ${
                  selected ? 'bg-emerald-50 border border-emerald-300' : 'border border-transparent'
                }`}
              >
                <Text style={tw`text-xl`}>{m.glyph}</Text>
                <Text
                  style={tw`text-[11px] mt-1 ${selected ? 'text-emerald-800 font-semibold' : 'text-stone-500'}`}
                >
                  {m.label}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>

      {mood ? (
        <Animated.View style={[tw`mt-3`, revealStyle]}>
          <Text style={tw`text-[13px] font-semibold text-stone-700 mb-2`}>Today I’ll grow in…</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={tw`gap-2 pr-2`}
          >
            {paths.map((key) => {
              const selected = path === key;
              return (
                <PressableScale
                  key={key}
                  feedback={false}
                  onPress={() => onPath(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={tw`px-3 py-1.5 rounded-full ${
                    selected ? 'bg-emerald-600' : 'bg-[#EAE4D6]'
                  }`}
                >
                  <Text style={tw`text-[13px] font-semibold ${selected ? 'text-white' : 'text-stone-700'}`}>
                    {pathLabel(key)}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <TextInput
            value={intention}
            onChangeText={(t) => setIntention(t.replace(/\n/g, ' ').slice(0, INTENTION_MAX))}
            placeholder="One small step (optional)"
            placeholderTextColor="#A8A29E"
            maxLength={INTENTION_MAX}
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Intention for today, optional"
            style={tw`mt-3 px-3.5 py-2.5 rounded-xl bg-white border border-stone-200 text-[15px] text-stone-900`}
          />

          <PressableScale
            feedback={false}
            disabled={saving}
            onPress={() => void onDone()}
            accessibilityRole="button"
            accessibilityLabel="Done, save check-in"
            style={tw`mt-3 py-3 rounded-xl bg-emerald-600 items-center ${saving ? 'opacity-70' : ''}`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={tw`text-white font-bold text-[15px]`}>Done</Text>
            )}
          </PressableScale>
        </Animated.View>
      ) : null}

      {error ? <Text style={tw`text-xs text-stone-500 mt-2`}>{error}</Text> : null}

      <View style={tw`flex-row items-center justify-between mt-2.5`}>
        {editing ? (
          <PressableScale
            feedback="close"
            onPress={() => {
              setEditing(false);
              setError(null);
              animateLayout();
              setPhase('pill');
            }}
            hitSlop={8}
          >
            <Text style={tw`text-xs font-semibold text-stone-500`}>Cancel</Text>
          </PressableScale>
        ) : !checkin ? (
          <PressableScale
            feedback={false}
            onPress={() => void onRest()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: restLeft <= 0 }}
            accessibilityLabel={`Rest today, ${restLeft} rest ${restLeft === 1 ? 'day' : 'days'} left`}
          >
            <Text style={tw`text-xs font-semibold ${restLeft > 0 ? 'text-emerald-700' : 'text-stone-400'}`}>
              🌿 Rest today · {restLeft} left
            </Text>
          </PressableScale>
        ) : (
          <View />
        )}
      </View>
      {restNote ? <Text style={tw`text-xs text-stone-500 mt-1.5 leading-4`}>{restNote}</Text> : null}
    </View>
  );
}

export default React.memo(TodayCard);
