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
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import WeekDots from '../recap/WeekDots';
import CountUpText from '../ui/CountUpText';
import CheckinWeekDots from './CheckinWeekDots';
import StreakBurst from './StreakBurst';
import { streakMilestoneCopy } from './streakMilestones';
import {
  CHECKIN_MOODS,
  FOLLOWUP_OPTIONS,
  checkinMoodMeta,
  firstNameOf,
  followupReply,
  isEvening,
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
import { celebrateOnce, haptic } from '../../theme/haptics';
import { duration, easing, pop, spring, timing } from '../../theme/motion';
import { getTimeOfDayGreeting } from '../../utils/greeting';
import { isBootRevealStarted, onBootRevealStart } from '../auth/bootSplashSignal';
import { getCategoryMeta } from '../../utils/categoryLabels';
import CATEGORIES from '../../data/categories';
import type { Mood } from '../../services/api/growth';

if (Platform.OS === 'android' && typeof UIManager.setLayoutAnimationEnabledExperimental === 'function') {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Phase = 'form' | 'reply' | 'pill';

const REPLY_HOLD_MS = 2400;
/** Milestone copy needs a beat longer to read before the card collapses. */
const MILESTONE_HOLD_MS = 3600;
/** Don't let a slow SecureStore read hold the reply back. */
const CELEBRATE_LOOKUP_MS = 300;
const INTENTION_MAX = 140;

function pathLabel(key: string | null | undefined): string {
  if (!key) return '';
  return getCategoryMeta(key).parentLabel;
}

/**
 * Cold start: if this card is already on screen under the boot splash, the
 * greeting arrives with the reveal (fade + 6pt rise, 260ms, 120ms after the
 * splash starts lifting). Mounted later → static. Reduce motion → static.
 */
function useBootRevealGreeting(reduceMotion: boolean) {
  const [underSplash] = useState(() => !isBootRevealStarted());
  const progress = useRef(new Animated.Value(underSplash ? 0 : 1)).current;
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  useEffect(() => {
    if (!underSplash) return undefined;
    return onBootRevealStart(({ animate }) => {
      if (!animate || reduceRef.current) {
        progress.setValue(1);
        return;
      }
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [progress, underSplash]);
  return useMemo(
    () =>
      underSplash
        ? {
            opacity: progress,
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
            ],
          }
        : null,
    [progress, underSplash]
  );
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
  const greetIn = useBootRevealGreeting(reduceMotion);

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
  /** Streak before this save — the reply counts up from it. */
  const [streakFrom, setStreakFrom] = useState(0);
  /** Milestone (3/7/14/30/50/100/365) being celebrated for the first time, else null. */
  const [milestone, setMilestone] = useState<number | null>(null);
  /** Bumped per save → replays the done sequence once the reply view is mounted. */
  const [replyRun, setReplyRun] = useState(0);

  const moodScales = useRef(CHECKIN_MOODS.map(() => new Animated.Value(1))).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const checkPop = useRef(new Animated.Value(1)).current;
  const replyIn = useRef(new Animated.Value(1)).current;
  const dotFill = useRef(new Animated.Value(1)).current;
  const streakPop = useRef(new Animated.Value(1)).current;
  const milestoneIn = useRef(new Animated.Value(1)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** True while Done is saving → keeps the server-sync effect from jumping to the pill. */
  const committing = useRef(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
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

  /** Reply → pill collapse: a gentle spring on the size change, skipped under Reduce Motion. */
  const animateCollapse = useCallback(() => {
    if (reduceMotion) return;
    LayoutAnimation.configureNext({
      duration: duration.gentle,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.86 },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
  }, [reduceMotion]);

  // Keep phase in sync with the server (new day → form; check-in from elsewhere → pill).
  useEffect(() => {
    if (!checkin) {
      if (phase !== 'form') setPhase('form');
      setEditing(false);
      return;
    }
    if (phase === 'form' && !editing && !saving && !committing.current) setPhase('pill');
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
    haptic('selection');
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
    haptic('selection');
    setPath((cur) => (cur === key ? null : key));
  };

  /**
   * Done sequence (≤ ~900ms, native driver): check pops → reply line rises →
   * "+N" and the streak count up (CountUpText, JS) → today's week dot springs
   * full. Milestone: the big streak number pops with a dot burst + copy.
   * Reduce motion: everything lands at once, milestone copy just fades in.
   */
  useEffect(() => {
    if (!replyRun) return undefined;
    if (reduceMotion) {
      checkPop.setValue(1);
      dotFill.setValue(1);
      streakPop.setValue(1);
      replyIn.setValue(0);
      milestoneIn.setValue(0);
      const fade = Animated.parallel([timing(replyIn, 1, {}, true), timing(milestoneIn, 1, {}, true)]);
      fade.start();
      return () => fade.stop();
    }
    checkPop.setValue(0.4);
    replyIn.setValue(0);
    dotFill.setValue(0);
    streakPop.setValue(0);
    milestoneIn.setValue(0);
    const seq = Animated.parallel([
      pop(checkPop, 1.15, 'bouncy'),
      timing(replyIn, 1, { duration: duration.quick, easing: easing.out, delay: 80 }),
      spring(dotFill, 1, 'snappy', false, { delay: 280 }),
      Animated.sequence([Animated.delay(220), pop(streakPop, 1.35, 'bouncy')]),
      timing(milestoneIn, 1, { duration: duration.base, easing: easing.out, delay: 380 }),
    ]);
    seq.start();
    return () => seq.stop();
  }, [replyRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDone = async () => {
    if (!mood || saving) return;
    // No tap haptic: the save itself answers with success (or celebrate / error).
    setError(null);
    const prevStreak = streak?.current ?? 0;
    const firstToday = !checkin;
    committing.current = true;
    try {
      const trimmed = intention.trim().slice(0, INTENTION_MAX);
      const res = await useGrowthStore.getState().saveCheckin({
        mood,
        path: path ?? null,
        intention: trimmed || null,
      });
      const awarded = res.points_awarded || 0;
      const nextStreak = res.streak?.current ?? prevStreak;
      const copy = firstToday ? streakMilestoneCopy(nextStreak) : null;
      // celebrateOnce fires haptic('celebrate') itself, the first time only.
      const fresh = copy
        ? await Promise.race([
            celebrateOnce(`streak:${nextStreak}`).catch(() => false),
            new Promise<boolean>((r) => setTimeout(() => r(false), CELEBRATE_LOOKUP_MS)),
          ])
        : false;
      if (!fresh) haptic('checkin');
      if (!mounted.current) return;
      const reached = fresh ? nextStreak : null;
      setPointsAwarded(awarded);
      setStreakFrom(prevStreak);
      setMilestone(reached);
      setEditing(false);
      setExpanded(false);
      animateLayout();
      setPhase('reply');
      setReplyRun((n) => n + 1);
      const reply = moodReply(res.checkin?.mood ?? mood);
      AccessibilityInfo.announceForAccessibility(
        [reply, awarded > 0 ? `Plus ${awarded} points` : '', streakLabel(nextStreak), reached ? copy : '']
          .filter(Boolean)
          .join('. ')
      );
      timers.current.push(
        setTimeout(() => {
          animateCollapse();
          setPhase('pill');
          setMilestone(null);
        }, reached ? MILESTONE_HOLD_MS : REPLY_HOLD_MS)
      );
    } catch {
      haptic('error');
      setError('Couldn’t save just now. Tap Done to try again.');
    } finally {
      committing.current = false;
    }
  };

  const restLeft = streak?.rest_days_left ?? 0;

  const onRest = async () => {
    if (saving) return;
    haptic('tapLight');
    if (restLeft <= 0) {
      setRestNote('No rest days left right now — one refills after 7 active days. Any small step counts today.');
      return;
    }
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
        haptic('error');
        setError('Couldn’t save just now. Try again in a moment.');
      }
    }
  };

  const onEdit = () => {
    haptic('tapLight');
    setMood(checkin?.mood ?? null);
    setPath(checkin?.path ?? null);
    setIntention(checkin?.intention ?? '');
    reveal.setValue(checkin?.mood ? 1 : 0);
    setEditing(true);
    animateLayout();
    setPhase('form');
  };

  const onWriteMore = () => {
    haptic('tapLight');
    useGrowthStore.getState().setComposeDraft({
      mood: journalMoodFromCheckin(checkin?.mood ?? null),
      path: checkin?.path ?? null,
      intention: checkin?.intention ?? null,
    });
    navigation.navigate('Journal', { openCompose: true });
  };

  const onTogglePill = () => {
    haptic('selection');
    animateLayout();
    setExpanded((v) => !v);
  };

  const onFollowup = async (value: Followup) => {
    if (!checkin || saving) return;
    haptic('selection');
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
      haptic('error');
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
      <View style={tw`mx-gutter mb-3 px-4 py-3.5 rounded-card bg-emerald-50 border border-emerald-100`}>
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`text-body font-semibold text-emerald-900 flex-1 pr-3`}>
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
    const reply = moodReply(checkin.mood);
    const milestoneCopy = milestone ? streakMilestoneCopy(milestone) : null;
    const rise = (v: Animated.Value, from: number) =>
      reduceMotion ? 0 : v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
    return (
      <View
        style={tw`mx-gutter mb-3 px-4 py-4 rounded-card bg-card border border-emerald-200/80`}
        accessible
        accessibilityLabel={[
          reply,
          pointsAwarded > 0 ? `Plus ${pointsAwarded} points` : '',
          streakLabel(current),
          milestoneCopy ?? '',
        ]
          .filter(Boolean)
          .join('. ')}
      >
        <View style={tw`flex-row items-center`}>
          <Animated.View
            style={[
              tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`,
              { transform: [{ scale: checkPop }] },
            ]}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
          </Animated.View>
          <Animated.View
            style={[tw`flex-1`, { opacity: replyIn, transform: [{ translateY: rise(replyIn, 6) }] }]}
          >
            <Text style={tw`text-body font-semibold text-ink`}>{reply}</Text>
            <Text style={tw`text-xs font-semibold text-energy-700 mt-1`}>
              {pointsAwarded > 0 ? (
                <>
                  <CountUpText key={`p${replyRun}`} value={pointsAwarded} from={0} prefix="+" delay={180} />
                  {' · '}
                </>
              ) : null}
              <CountUpText
                key={`s${replyRun}`}
                value={current}
                from={streakFrom}
                suffix="-day streak"
                delay={180}
              />
            </Text>
          </Animated.View>
          {streak.week?.length ? (
            <View style={tw`ml-2`}>
              <CheckinWeekDots days={streak.week} todayKey={streak.today || localDateKey()} fill={dotFill} size={8} />
            </View>
          ) : null}
        </View>

        {milestoneCopy && milestone ? (
          <View style={tw`flex-row items-center mt-3 pt-3 border-t border-emerald-100`}>
            <View style={tw`w-16 h-12 items-center justify-center mr-2`}>
              {!reduceMotion ? <StreakBurst triggerKey={replyRun} delay={260} radius={30} /> : null}
              <Animated.Text
                style={[
                  tw`text-[30px] font-extrabold text-energy-700`,
                  { fontVariant: ['tabular-nums'], transform: [{ scale: streakPop }] },
                ]}
              >
                {milestone}
              </Animated.Text>
            </View>
            <Animated.Text
              style={[
                tw`flex-1 text-body font-semibold text-emerald-900`,
                { opacity: milestoneIn, transform: [{ translateY: rise(milestoneIn, 4) }] },
              ]}
            >
              {milestoneCopy}
            </Animated.Text>
          </View>
        ) : null}
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
      <View style={tw`mx-gutter mb-3`}>
        <PressableScale
          feedback={false}
          onPress={onTogglePill}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`Checked in. ${streakLabel(current)}${label ? `. ${label}` : ''}`}
          style={tw`flex-row items-center px-3.5 py-2.5 rounded-chip bg-emerald-50 border border-emerald-100`}
        >
          <View style={tw`w-5 h-5 rounded-full bg-emerald-600 items-center justify-center mr-2`}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
          <Text style={tw`flex-1 text-footnote font-semibold text-emerald-900`} numberOfLines={1}>
            Checked in · {streakLabel(current)}
            {label ? ` · ${label}` : ''}
          </Text>
          <WeekDots days={streak.week} size={7} />
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.colors.leafInk}
            style={tw`ml-2`}
          />
        </PressableScale>

        {showFollowup && !followupLine ? (
          <View style={tw`mt-2 px-4 py-3 rounded-card bg-card border border-line/70`}>
            <Text style={tw`text-body font-semibold text-ink`}>
              {label ? `Did you grow in ${label} today?` : 'Did you take that small step today?'}
            </Text>
            <Text style={tw`text-xs text-ink-3 mt-0.5`} numberOfLines={2}>
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
                  style={tw`flex-1 py-2 rounded-chip items-center ${
                    o.value === 'yes' ? 'bg-emerald-600' : 'bg-raised'
                  }`}
                >
                  <Text
                    style={tw`text-footnote font-semibold ${o.value === 'yes' ? 'text-white' : 'text-ink'}`}
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
          <View style={tw`mt-2 px-4 py-3 rounded-card bg-card border border-line/70`}>
            {moodMeta ? (
              <Text style={tw`text-xs text-ink-3`}>
                Arrived feeling {moodMeta.glyph} {moodMeta.label.toLowerCase()}
              </Text>
            ) : null}
            {checkin.intention ? (
              <Text style={tw`text-body text-ink mt-1`}>“{checkin.intention}”</Text>
            ) : (
              <Text style={tw`text-sm text-ink-3 mt-1`}>No intention today — that’s fine.</Text>
            )}
            {doneFollowup ? (
              <Text style={tw`text-xs text-emerald-800 mt-1.5`}>{doneFollowup}</Text>
            ) : null}
            <View style={tw`flex-row gap-2 mt-3`}>
              <PressableScale
                feedback={false}
                onPress={onWriteMore}
                accessibilityRole="button"
                style={tw`flex-1 py-2.5 rounded-control bg-emerald-600 items-center flex-row justify-center gap-1.5`}
              >
                <Ionicons name="book-outline" size={15} color="#FFFFFF" />
                <Text style={tw`text-white font-semibold text-footnote`}>Write more</Text>
              </PressableScale>
              <PressableScale
                feedback={false}
                onPress={onEdit}
                accessibilityRole="button"
                style={tw`px-4 py-2.5 rounded-control bg-raised items-center`}
              >
                <Text style={tw`text-ink font-semibold text-footnote`}>Edit</Text>
              </PressableScale>
            </View>
          </View>
        ) : !journaledToday && !showFollowup ? (
          // Former HomeSitCue: one quiet journal nudge, only after the check-in.
          <PressableScale
            feedback={false}
            onPress={onWriteMore}
            accessibilityRole="button"
            style={tw`mt-2 flex-row items-center px-3.5 py-2.5 rounded-card ${
              sundaySit ? 'bg-energy-50 border border-red-200/80' : 'bg-card border border-line/70'
            }`}
          >
            <Ionicons
              name={sundaySit ? 'sunny-outline' : 'book-outline'}
              size={16}
              color={sundaySit ? theme.colors.energy : theme.colors.brand}
            />
            <Text style={tw`flex-1 ml-2 text-footnote text-ink-2`} numberOfLines={1}>
              {sundaySit ? 'Sunday sit — a quiet page for the week' : 'Write more about today, privately'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.colors.iconMuted} />
          </PressableScale>
        ) : null}
        {error ? <Text style={tw`text-xs text-ink-3 mt-1.5 px-2`}>{error}</Text> : null}
      </View>
    );
  }

  // ---------- Form (not done yet / editing) ----------
  return (
    <View style={tw`mx-gutter mb-3 px-4 pt-4 pb-3.5 rounded-sheet bg-card border border-line/70`}>
      <View style={tw`flex-row items-start justify-between`}>
        <View style={tw`flex-1 pr-3`}>
          <Animated.Text style={[tw`text-callout font-bold text-ink`, greetIn]}>
            {greeting}
          </Animated.Text>
          <Text style={tw`text-sm text-ink-3 mt-0.5`}>
            {editing ? 'Update today’s check-in.' : 'How are you arriving today?'}
          </Text>
        </View>
        <View style={tw`items-end pt-1`}>
          <WeekDots days={streak.week} size={8} />
          {current > 0 ? (
            <Text style={[tw`text-caption font-semibold text-energy-700 mt-1`, { fontVariant: ['tabular-nums'] }]}>
              {streakLabel(current)}
            </Text>
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
                style={tw`items-center px-2 py-2 rounded-card min-w-[56px] ${
                  selected ? 'bg-emerald-50 border border-emerald-300' : 'border border-transparent'
                }`}
              >
                <Text style={tw`text-xl`}>{m.glyph}</Text>
                <Text
                  style={tw`text-caption mt-1 ${selected ? 'text-emerald-800 font-semibold' : 'text-ink-3 font-medium'}`}
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
          <Text style={tw`text-footnote font-semibold text-ink-2 mb-2`}>Today I’ll grow in…</Text>
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
                  style={tw`px-3 py-1.5 rounded-chip ${
                    selected ? 'bg-emerald-600' : 'bg-raised'
                  }`}
                >
                  <Text style={tw`text-footnote font-semibold ${selected ? 'text-white' : 'text-ink-2'}`}>
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
            placeholderTextColor={theme.colors.placeholder}
            maxLength={INTENTION_MAX}
            returnKeyType="done"
            blurOnSubmit
            accessibilityLabel="Intention for today, optional"
            style={tw`mt-3 px-3.5 py-2.5 rounded-control bg-card border border-line text-body text-ink`}
          />

          <PressableScale
            feedback={false}
            disabled={saving}
            onPress={() => void onDone()}
            accessibilityRole="button"
            accessibilityLabel="Done, save check-in"
            style={tw`mt-3 py-3 rounded-control bg-emerald-600 items-center ${saving ? 'opacity-70' : ''}`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={tw`text-white font-bold text-body`}>Done</Text>
            )}
          </PressableScale>
        </Animated.View>
      ) : null}

      {error ? <Text style={tw`text-xs text-ink-3 mt-2`}>{error}</Text> : null}

      <View style={tw`flex-row items-center justify-between mt-2.5`}>
        {editing ? (
          <PressableScale
            feedback={false}
            onPress={() => {
              haptic('selection');
              setEditing(false);
              setError(null);
              animateLayout();
              setPhase('pill');
            }}
            hitSlop={8}
          >
            <Text style={tw`text-xs font-semibold text-ink-3`}>Cancel</Text>
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
            <Text style={tw`text-xs font-semibold ${restLeft > 0 ? 'text-emerald-700' : 'text-ink-3'}`}>
              🌿 Rest today · {restLeft} left
            </Text>
          </PressableScale>
        ) : (
          <View />
        )}
      </View>
      {restNote ? <Text style={tw`text-xs text-ink-3 mt-1.5 leading-4`}>{restNote}</Text> : null}
    </View>
  );
}

export default React.memo(TodayCard);
