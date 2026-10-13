import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import tw from '../../lib/tw';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import PressableScale from '../../components/ui/PressableScale';
import MoodWeekStrip from '../../components/journal/MoodWeekStrip';
import JournalComposeModal from '../../components/journal/JournalComposeModal';
import CircleJournalCard from '../../components/journal/CircleJournalCard';
import JournalQuoteReplySheet from '../../components/journal/JournalQuoteReplySheet';
import JournalModeSwitcher, {
  type JournalMode,
} from '../../components/journal/JournalModeSwitcher';
import CirclePresenceStrip from '../../components/journal/CirclePresenceStrip';
import JournalReflectionsSheet from '../../components/journal/JournalReflectionsSheet';
import {
  ALL_MOODS,
  MOOD_META,
  computeStreak,
  dateKeyFromIso,
  formatHeroDate,
  formatSectionTitle,
  growthPathFromTags,
  localDateKey,
  promptForDay,
} from '../../components/journal/journalMeta';
import {
  getCircleJournalEntries,
  getJournalReflections,
  type CircleJournalEntry,
  type JournalReflection,
} from '../../services/api/journal';
import { createConversation } from '../../services/api/messages';
import {
  verticalScrollProps,
  feedListPerformanceProps,
  TAB_SCREEN_BOTTOM_PADDING,
} from '../../constants/scroll';
import { useAppDispatch, useAppSelector, useAuth } from '../../store/hooks';
import CATEGORIES from '../../data/categories';
import {
  fetchJournalEntries,
  addJournalEntry,
  removeJournalEntry,
  type JournalEntry,
  type JournalMood,
} from '../../store/slices/journalSlice';
import { feedback } from '../../utils/interactionFeedback';
import type { IndividualTabsParamList } from '../../app/navigation/tabs/IndividualTabs';

type ViewTab = 'today' | 'timeline';
type VisibilityFilter = 'all' | 'private' | 'shared';

type DateSection = {
  title: string;
  dateKey: string;
  data: JournalEntry[];
};

function pathLabel(key: string | null): string | null {
  if (!key) return null;
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function EntryCard({
  entry,
  onDelete,
}: {
  entry: JournalEntry;
  onDelete: (id: string) => void;
}) {
  const mood = (entry.mood as JournalMood | null) || null;
  const meta = mood ? MOOD_META[mood] : null;
  const path = growthPathFromTags(entry.tags || []);
  const isPublic = entry.isPublic ?? entry.is_public;

  return (
    <View
      style={[
        tw`mb-3 px-4 py-4 rounded-2xl`,
        {
          backgroundColor: meta?.wash || '#FFFcf7',
          borderWidth: 1,
          borderColor: 'rgba(28,25,23,0.06)',
        },
      ]}
    >
      <View style={tw`flex-row items-center justify-between mb-2`}>
        <View style={tw`flex-row items-center flex-1`}>
          {meta ? <Text style={tw`text-base mr-2`}>{meta.glyph}</Text> : null}
          <Text style={tw`text-xs text-stone-500`}>
            {new Date(entry.created_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
            {meta ? ` · ${meta.label}` : ''}
          </Text>
        </View>
        <View style={tw`flex-row items-center gap-3`}>
          <Ionicons
            name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
            size={14}
            color="#78716C"
          />
          <PressableScale
            feedback="delete"
            onPress={() => onDelete(entry.id)}
            hitSlop={10}
            accessibilityLabel="Delete entry"
          >
            <Ionicons name="trash-outline" size={16} color="#A8A29E" />
          </PressableScale>
        </View>
      </View>
      <Text style={tw`text-stone-900 text-[16px] leading-6`}>{entry.content}</Text>
      {path ? (
        <View style={tw`mt-3 self-start px-2.5 py-1 rounded-full bg-stone-900/5`}>
          <Text style={tw`text-[11px] font-semibold text-stone-600`}>{pathLabel(path)}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function JournalScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const route = useRoute<RouteProp<IndividualTabsParamList, 'Journal'>>();
  const navigation = useNavigation<BottomTabNavigationProp<IndividualTabsParamList, 'Journal'>>();
  const { entries, isLoading, isSaving, error } = useAppSelector((s) => s.journal);

  const [mode, setMode] = useState<JournalMode>('pages');
  const [viewTab, setViewTab] = useState<ViewTab>('today');
  const [composeOpen, setComposeOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [focusDateKey, setFocusDateKey] = useState<string | null>(null);
  const [circleEntries, setCircleEntries] = useState<CircleJournalEntry[]>([]);
  const [circleLoading, setCircleLoading] = useState(false);
  const [circleError, setCircleError] = useState<string | null>(null);
  const [replyEntry, setReplyEntry] = useState<CircleJournalEntry | null>(null);
  const [voiceFilterUserId, setVoiceFilterUserId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<JournalReflection[]>([]);
  const [reflectionsLoading, setReflectionsLoading] = useState(false);
  const [reflectionsOpen, setReflectionsOpen] = useState(false);

  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentSlide = useRef(new Animated.Value(0)).current;

  const userPath = useMemo(() => {
    const cats = Array.isArray(user?.categories) ? user.categories : [];
    const first = cats.find((c) => typeof c === 'string' && c.trim());
    return typeof first === 'string' ? first.trim() : null;
  }, [user?.categories]);

  const todayPrompt = useMemo(() => promptForDay(new Date(), userPath), [userPath]);

  const loadEntries = useCallback(async () => {
    await dispatch(fetchJournalEntries()).unwrap();
  }, [dispatch]);

  const loadCircle = useCallback(async () => {
    setCircleLoading(true);
    setCircleError(null);
    try {
      const res = await getCircleJournalEntries({ limit: 40 });
      setCircleEntries(res.data?.entries ?? []);
    } catch (e) {
      setCircleError(e instanceof Error ? e.message : 'Could not load circle');
      setCircleEntries([]);
    } finally {
      setCircleLoading(false);
    }
  }, []);

  const loadReflections = useCallback(async () => {
    setReflectionsLoading(true);
    try {
      const res = await getJournalReflections({ limit: 30 });
      setReflections(res.data?.reflections ?? []);
    } catch {
      setReflections([]);
    } finally {
      setReflectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
    void loadReflections();
    void loadCircle();
  }, [loadEntries, loadReflections, loadCircle]);

  const filteredCircleEntries = useMemo(() => {
    if (!voiceFilterUserId) return circleEntries;
    return circleEntries.filter((e) => e.user_id === voiceFilterUserId);
  }, [circleEntries, voiceFilterUserId]);

  useEffect(() => {
    if (route.params?.openCompose) {
      setComposeOpen(true);
      setViewTab('today');
      navigation.setParams({ openCompose: undefined });
    }
  }, [route.params?.openCompose, navigation]);

  const animateModeChange = useCallback(
    (next: JournalMode) => {
      if (next === mode) return;
      feedback.transition();
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(contentSlide, {
          toValue: next === 'voices' ? -8 : 8,
          duration: 110,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMode(next);
        if (next === 'voices') setVoiceFilterUserId(null);
        contentSlide.setValue(next === 'voices' ? 8 : -8);
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.spring(contentSlide, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 6,
          }),
        ]).start();
      });
    },
    [mode, contentOpacity, contentSlide]
  );

  const dateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(dateKeyFromIso(e.created_at));
    return set;
  }, [entries]);

  const streak = useMemo(() => computeStreak(dateKeys), [dateKeys]);

  const todayKey = localDateKey();
  const todayEntries = useMemo(
    () => entries.filter((e) => dateKeyFromIso(e.created_at) === todayKey),
    [entries, todayKey]
  );

  const filteredEntries = useMemo(() => {
    let list = entries;
    if (visibility === 'private') {
      list = list.filter((e) => !(e.isPublic ?? e.is_public));
    } else if (visibility === 'shared') {
      list = list.filter((e) => e.isPublic ?? e.is_public);
    }
    if (focusDateKey) {
      list = list.filter((e) => dateKeyFromIso(e.created_at) === focusDateKey);
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        (e.mood && e.mood.toLowerCase().includes(q))
    );
  }, [entries, visibility, searchQuery, focusDateKey]);

  const sections: DateSection[] = useMemo(() => {
    const grouped = new Map<string, JournalEntry[]>();
    for (const entry of filteredEntries) {
      const key = dateKeyFromIso(entry.created_at);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([dateKey, data]) => ({
        title: formatSectionTitle(dateKey),
        dateKey,
        data,
      }));
  }, [filteredEntries]);

  const moodCounts = useMemo(() => {
    const counts: Partial<Record<JournalMood, number>> = {};
    for (const e of entries) {
      if (!e.mood) continue;
      const m = e.mood as JournalMood;
      if (!ALL_MOODS.includes(m)) continue;
      counts[m] = (counts[m] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3) as [JournalMood, number][];
  }, [entries]);

  const onRefresh = async () => {
    setRefreshing(true);
    feedback.refresh();
    try {
      if (mode === 'voices') {
        await Promise.all([loadCircle(), loadReflections()]);
      } else {
        await Promise.all([loadEntries(), loadReflections()]);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const sharedCount = useMemo(
    () => entries.filter((e) => e.isPublic ?? e.is_public).length,
    [entries]
  );

  const openProfile = (userId: string) => {
    feedback.open();
    const root = navigation.getParent?.() || navigation;
    (root as { navigate: (a: string, b: object) => void }).navigate('PublicProfile', { userId });
  };

  const messageAboutEntry = async (
    entry: CircleJournalEntry,
    opts?: { quote?: string; body?: string }
  ) => {
    try {
      const res = await createConversation(entry.user_id);
      const snippet = (opts?.quote || entry.content).trim().slice(0, 80);
      const draft =
        opts?.body && opts?.quote
          ? `About “${snippet}${opts.quote.length > 80 ? '…' : ''}”: ${opts.body}`
          : `Read your journal — “${snippet}${entry.content.length > 80 ? '…' : ''}” hit me.`;
      feedback.send();
      const root = navigation.getParent?.() || navigation;
      (root as { navigate: (a: string, b: object) => void }).navigate('Messages', {
        conversationId: res.data.conversation.id,
        targetUserId: entry.user_id,
        draftText: draft,
      });
    } catch (e) {
      feedback.error();
      Alert.alert(
        'Cannot message',
        e instanceof Error ? e.message : 'You can only message mutual friends.'
      );
    }
  };

  const handleSave = async (payload: {
    content: string;
    mood?: JournalMood;
    is_public: boolean;
    tags: string[];
    metadata?: Record<string, unknown>;
  }) => {
    try {
      await dispatch(addJournalEntry(payload)).unwrap();
      feedback.success();
      setComposeOpen(false);
      setViewTab('today');
    } catch (e) {
      feedback.error();
      const msg = e instanceof Error ? e.message : 'Could not save entry';
      Alert.alert('Error', msg);
    }
  };

  const handleDelete = (entryId: string) => {
    Alert.alert('Delete entry', 'Remove this journal entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          feedback.delete();
          void dispatch(removeJournalEntry(entryId));
        },
      },
    ]);
  };

  const openCompose = () => {
    feedback.open();
    setComposeOpen(true);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['top']}>
      <GrowChromeHeader
        right={
          <PressableScale
            feedback="open"
            onPress={openCompose}
            style={tw`w-9 h-9 rounded-full bg-[#EAE4D6] border border-stone-200/80 items-center justify-center`}
            accessibilityLabel="New journal entry"
          >
            <Ionicons name="pencil" size={17} color="#059669" />
          </PressableScale>
        }
      />

      <View style={tw`px-5 pt-2 pb-2`}>
        <View style={tw`flex-row items-center justify-between mb-2`}>
          <View style={tw`flex-1 pr-3`}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase`}>
              Journal
            </Text>
            <Text style={tw`text-[22px] font-bold text-stone-900 mt-0.5`} numberOfLines={1}>
              {mode === 'pages' ? 'Your pages' : 'Voices'}
            </Text>
          </View>
          {mode === 'pages' && reflections.length > 0 ? (
            <PressableScale
              feedback="open"
              onPress={() => setReflectionsOpen(true)}
              style={tw`px-3 py-2 rounded-full bg-[#FFF1F0] border border-[#FECACA] flex-row items-center`}
            >
              <Ionicons name="chatbubbles-outline" size={14} color="#E11D48" />
              <Text style={tw`text-xs font-bold text-[#E11D48] ml-1`}>{reflections.length}</Text>
            </PressableScale>
          ) : null}
        </View>

        <JournalModeSwitcher
          mode={mode}
          onChange={animateModeChange}
          voicesCount={circleEntries.length}
          reflectionsCount={reflections.length}
        />

        {mode === 'pages' ? (
          <View style={tw`flex-row mt-3 gap-5`}>
            {(
              [
                { key: 'today' as const, label: 'Today' },
                { key: 'timeline' as const, label: 'Timeline' },
              ] as const
            ).map((tab) => {
              const active = viewTab === tab.key;
              return (
                <PressableScale
                  key={tab.key}
                  feedback="select"
                  onPress={() => {
                    if (viewTab === tab.key) return;
                    setViewTab(tab.key);
                  }}
                  style={tw`pb-1.5 border-b-2 ${
                    active ? 'border-emerald-600' : 'border-transparent'
                  }`}
                >
                  <Text
                    style={tw`text-[15px] ${
                      active ? 'text-stone-900 font-bold' : 'text-stone-400 font-medium'
                    }`}
                  >
                    {tab.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        ) : (
          <Text style={tw`text-sm text-stone-500 mt-2.5`}>
            Sit with a friend’s note — reply to a line or message privately.
          </Text>
        )}
      </View>

      {mode === 'pages' && error ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100`}>
          <Text style={tw`text-sm text-red-700`}>{error}</Text>
        </View>
      ) : null}
      {mode === 'voices' && circleError ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100`}>
          <Text style={tw`text-sm text-red-700`}>{circleError}</Text>
        </View>
      ) : null}

      <Animated.View
        style={{
          flex: 1,
          opacity: contentOpacity,
          transform: [{ translateX: contentSlide }],
        }}
      >
        {mode === 'voices' ? (
          <FlatList
            data={filteredCircleEntries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[tw`px-5 pt-1`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
            {...feedListPerformanceProps}
            {...verticalScrollProps}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor="#059669"
              />
            }
            ListHeaderComponent={
              <View>
                <CirclePresenceStrip
                  entries={circleEntries}
                  selectedUserId={voiceFilterUserId}
                  onSelect={setVoiceFilterUserId}
                />
                {voiceFilterUserId ? (
                  <Text style={tw`text-sm text-stone-500 mb-3`}>
                    Showing one voice ·{' '}
                    <Text
                      style={tw`text-emerald-700 font-semibold`}
                      onPress={() => {
                        feedback.select();
                        setVoiceFilterUserId(null);
                      }}
                    >
                      Clear
                    </Text>
                  </Text>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <CircleJournalCard
                entry={item}
                onOpenProfile={openProfile}
                onMessage={(e) => void messageAboutEntry(e)}
                onReplyToLine={(e) => {
                  feedback.open();
                  setReplyEntry(e);
                }}
                onMuted={(userId) =>
                  setCircleEntries((prev) => prev.filter((e) => e.user_id !== userId))
                }
              />
            )}
            ListEmptyComponent={
              circleLoading ? (
                <View style={tw`py-12 items-center`}>
                  <ActivityIndicator color="#059669" />
                </View>
              ) : voiceFilterUserId ? (
                <EmptyState
                  icon="person-outline"
                  title="No pages from them"
                  description="They haven’t shared a public journal recently — or you muted them."
                  actionLabel="Show everyone"
                  onAction={() => setVoiceFilterUserId(null)}
                />
              ) : (
                <EmptyState
                  icon="radio-outline"
                  title="Voices is quiet"
                  description="When friends share a public journal, their notes land here. You can reply to a sentence or message privately."
                  actionLabel="Share one of your pages"
                  onAction={() => {
                    animateModeChange('pages');
                    openCompose();
                  }}
                />
              )
            }
          />
        ) : viewTab === 'today' ? (
          <ScrollView
            style={tw`flex-1`}
            contentContainerStyle={{ paddingBottom: TAB_SCREEN_BOTTOM_PADDING }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor="#1C1917"
              />
            }
            {...verticalScrollProps}
          >
            <View
              style={[
                tw`mx-5 mt-1 mb-3 rounded-3xl px-5 pt-5 pb-5 overflow-hidden`,
                {
                  backgroundColor: '#EAE4D6',
                  borderWidth: 1,
                  borderColor: 'rgba(28,25,23,0.06)',
                },
              ]}
            >
              <View
                pointerEvents="none"
                style={[
                  tw`absolute -top-16 -right-10 w-48 h-48 rounded-full`,
                  { backgroundColor: 'rgba(16,185,129,0.12)' },
                ]}
              />
              <View style={tw`flex-row items-start justify-between mb-4`}>
                <View style={tw`flex-1 pr-3`}>
                  <Text style={tw`text-stone-500 text-sm`}>{formatHeroDate()}</Text>
                  <Text style={tw`text-[22px] text-stone-900 mt-2 leading-7`}>{todayPrompt}</Text>
                </View>
                {streak > 0 ? (
                  <View style={tw`items-center`}>
                    <View
                      style={tw`w-14 h-14 rounded-full border-2 border-energy-600 items-center justify-center bg-energy-50`}
                    >
                      <Text style={tw`text-lg font-bold text-energy-700`}>{streak}</Text>
                    </View>
                    <Text style={tw`text-[10px] text-energy-700 mt-1 font-medium`}>day streak</Text>
                  </View>
                ) : null}
              </View>

              <MoodWeekStrip
                entries={entries}
                onSelectDay={(key) => {
                  feedback.select();
                  setFocusDateKey(key);
                  setViewTab('timeline');
                }}
              />

              <PressableScale
                feedback="open"
                onPress={openCompose}
                style={tw`mt-5 bg-stone-900 rounded-2xl py-3.5 items-center flex-row justify-center`}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={tw`text-white font-semibold ml-2`}>
                  {todayEntries.length > 0 ? 'Write another entry' : "Write today's entry"}
                </Text>
              </PressableScale>
            </View>

            {(reflections.length > 0 || sharedCount > 0) && (
              <PressableScale
                feedback="open"
                onPress={() => setReflectionsOpen(true)}
                style={tw`mx-5 mb-3 px-4 py-3.5 rounded-2xl bg-[#FFFcf7] border border-stone-200/80 flex-row items-center`}
              >
                <View
                  style={tw`w-10 h-10 rounded-full bg-[#FFF1F0] items-center justify-center mr-3`}
                >
                  <Ionicons name="chatbubbles" size={18} color="#E11D48" />
                </View>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-[15px] font-bold text-stone-900`}>Reflections</Text>
                  <Text style={tw`text-sm text-stone-500 mt-0.5`} numberOfLines={2}>
                    {reflections.length > 0
                      ? `${reflections.length} ${
                          reflections.length === 1 ? 'person sat' : 'people sat'
                        } with a line you shared`
                      : `${sharedCount} shared ${
                          sharedCount === 1 ? 'page' : 'pages'
                        } · replies will land here`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A8A29E" />
              </PressableScale>
            )}

            {circleEntries.length > 0 ? (
              <PressableScale
                feedback="transition"
                onPress={() => animateModeChange('voices')}
                style={tw`mx-5 mb-3 px-4 py-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex-row items-center`}
              >
                <View
                  style={tw`w-10 h-10 rounded-full bg-emerald-600 items-center justify-center mr-3`}
                >
                  <Ionicons name="radio" size={18} color="#fff" />
                </View>
                <View style={tw`flex-1 pr-2`}>
                  <Text style={tw`text-[15px] font-bold text-emerald-900`}>New voices nearby</Text>
                  <Text style={tw`text-sm text-emerald-800/80 mt-0.5`} numberOfLines={1}>
                    {circleEntries.length} public{' '}
                    {circleEntries.length === 1 ? 'note' : 'notes'} from your circle
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#059669" />
              </PressableScale>
            ) : null}

            <View style={tw`px-5 mb-2`}>
              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
                Today
              </Text>
              {isLoading && entries.length === 0 ? (
                <ActivityIndicator color="#1C1917" style={tw`py-8`} />
              ) : todayEntries.length === 0 ? (
                <View
                  style={tw`py-6 px-4 rounded-2xl bg-white/50 border border-dashed border-stone-300`}
                >
                  <Text style={tw`text-stone-600 text-center leading-6`}>
                    No entry yet. A few honest lines are enough.
                  </Text>
                </View>
              ) : (
                todayEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onDelete={handleDelete} />
                ))
              )}
            </View>

            {moodCounts.length > 0 ? (
              <View style={tw`px-5 mt-2`}>
                <Text
                  style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}
                >
                  Recent moods
                </Text>
                <View style={tw`flex-row flex-wrap gap-2`}>
                  {moodCounts.map(([mood, count]) => (
                    <View
                      key={mood}
                      style={[
                        tw`flex-row items-center px-3 py-2 rounded-full`,
                        { backgroundColor: MOOD_META[mood].wash },
                      ]}
                    >
                      <Text style={tw`mr-1.5`}>{MOOD_META[mood].glyph}</Text>
                      <Text style={tw`text-sm text-stone-700 font-medium`}>
                        {MOOD_META[mood].label}
                      </Text>
                      <Text style={tw`text-xs text-stone-500 ml-1.5`}>{count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[tw`px-5 pt-2`, { paddingBottom: TAB_SCREEN_BOTTOM_PADDING }]}
            stickySectionHeadersEnabled
            {...feedListPerformanceProps}
            {...verticalScrollProps}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void onRefresh()}
                tintColor="#1C1917"
              />
            }
            ListHeaderComponent={
              <View style={tw`mb-2`}>
                <SearchField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search entries, mood, path"
                />
                <View style={tw`mt-3 mb-1 flex-row flex-wrap gap-2`}>
                  {(
                    [
                      { key: 'all', label: 'All' },
                      { key: 'private', label: 'Private' },
                      { key: 'shared', label: 'Shared' },
                    ] as const
                  ).map((f) => {
                    const active = visibility === f.key;
                    return (
                      <PressableScale
                        key={f.key}
                        feedback="select"
                        onPress={() => setVisibility(f.key)}
                        style={tw`px-3.5 py-1.5 rounded-full border ${
                          active
                            ? 'bg-stone-900 border-stone-900'
                            : 'bg-white/70 border-stone-200'
                        }`}
                      >
                        <Text
                          style={tw`text-sm ${
                            active ? 'text-white font-semibold' : 'text-stone-600'
                          }`}
                        >
                          {f.label}
                        </Text>
                      </PressableScale>
                    );
                  })}
                  {focusDateKey ? (
                    <PressableScale
                      feedback="close"
                      onPress={() => setFocusDateKey(null)}
                      style={tw`px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-200 flex-row items-center`}
                    >
                      <Text style={tw`text-sm text-amber-900 mr-1`}>
                        {formatSectionTitle(focusDateKey)}
                      </Text>
                      <Ionicons name="close" size={14} color="#92400E" />
                    </PressableScale>
                  ) : null}
                </View>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <View style={tw`py-2 bg-[#F3EEE4]`}>
                <Text style={tw`text-sm font-semibold text-stone-600`}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item }) => <EntryCard entry={item} onDelete={handleDelete} />}
            ListEmptyComponent={
              isLoading ? (
                <View style={tw`py-12 items-center`}>
                  <ActivityIndicator color="#1C1917" />
                </View>
              ) : searchQuery.trim() || focusDateKey || visibility !== 'all' ? (
                <EmptyState
                  icon="search-outline"
                  title="No matches"
                  description="Try clearing filters or search."
                  actionLabel="Reset"
                  onAction={() => {
                    setSearchQuery('');
                    setFocusDateKey(null);
                    setVisibility('all');
                  }}
                />
              ) : (
                <EmptyState
                  icon="book-outline"
                  title="Your timeline is empty"
                  description="Start with today’s check-in. Private by default — share only when you want to."
                  actionLabel="Write today’s entry"
                  onAction={openCompose}
                />
              )
            }
          />
        )}
      </Animated.View>

      <JournalComposeModal
        visible={composeOpen}
        isSaving={isSaving}
        initialPrompt={todayPrompt}
        preferredPath={userPath}
        onClose={() => {
          feedback.close();
          setComposeOpen(false);
        }}
        onSave={(payload) => void handleSave(payload)}
      />

      <JournalQuoteReplySheet
        visible={!!replyEntry}
        entry={replyEntry}
        onClose={() => setReplyEntry(null)}
        onPrivateReply={(entry, quote, body) => {
          void messageAboutEntry(entry, { quote, body });
        }}
      />

      <JournalReflectionsSheet
        visible={reflectionsOpen}
        loading={reflectionsLoading}
        reflections={reflections}
        onClose={() => setReflectionsOpen(false)}
        onOpenVoices={() => {
          setReflectionsOpen(false);
          animateModeChange('voices');
        }}
      />
    </SafeAreaView>
  );
}
