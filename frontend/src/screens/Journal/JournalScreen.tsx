import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import tw from '../../lib/tw';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import MoodWeekStrip from '../../components/journal/MoodWeekStrip';
import JournalComposeModal from '../../components/journal/JournalComposeModal';
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
  verticalScrollProps,
  feedListPerformanceProps,
  horizontalScrollProps,
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
import { triggerPressFeedback } from '../../utils/interactionFeedback';
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
          <TouchableOpacity onPress={() => onDelete(entry.id)} hitSlop={10}>
            <Ionicons name="trash-outline" size={16} color="#A8A29E" />
          </TouchableOpacity>
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

  const [viewTab, setViewTab] = useState<ViewTab>('today');
  const [composeOpen, setComposeOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [focusDateKey, setFocusDateKey] = useState<string | null>(null);

  const userPath = useMemo(() => {
    const cats = Array.isArray(user?.categories) ? user.categories : [];
    const first = cats.find((c) => typeof c === 'string' && c.trim());
    return typeof first === 'string' ? first.trim() : null;
  }, [user?.categories]);

  const todayPrompt = useMemo(() => promptForDay(new Date(), userPath), [userPath]);

  const loadEntries = useCallback(async () => {
    await dispatch(fetchJournalEntries()).unwrap();
  }, [dispatch]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // Open compose when launched from the dock Create menu.
  useEffect(() => {
    if (route.params?.openCompose) {
      setComposeOpen(true);
      setViewTab('today');
      navigation.setParams({ openCompose: undefined });
    }
  }, [route.params?.openCompose, navigation]);

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
    try {
      await loadEntries();
    } finally {
      setRefreshing(false);
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
      setComposeOpen(false);
      setViewTab('today');
    } catch (e) {
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
        onPress: () => void dispatch(removeJournalEntry(entryId)),
      },
    ]);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-[#F3EEE4]`} edges={['top']}>
      <View style={tw`px-5 pt-3 pb-2`}>
        <View style={tw`flex-row items-end justify-between mb-4`}>
          <View>
            <Text style={tw`text-[11px] tracking-[3px] uppercase text-stone-500 font-semibold`}>
              Grow!
            </Text>
            <Text style={tw`text-3xl text-stone-900 mt-1`} numberOfLines={1}>
              Journal
            </Text>
          </View>
          <Pressable
            onPress={() => {
              triggerPressFeedback();
              setComposeOpen(true);
            }}
            style={tw`w-11 h-11 rounded-full bg-stone-900 items-center justify-center`}
            accessibilityLabel="New journal entry"
          >
            <Ionicons name="pencil" size={18} color="#fff" />
          </Pressable>
        </View>

        <View style={tw`flex-row bg-white/60 rounded-full p-1 border border-stone-200/80`}>
          {([
            { key: 'today', label: 'Today' },
            { key: 'timeline', label: 'Timeline' },
          ] as const).map((tab) => {
            const active = viewTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setViewTab(tab.key)}
                style={tw`flex-1 py-2.5 rounded-full items-center ${
                  active ? 'bg-stone-900' : ''
                }`}
              >
                <Text
                  style={tw`text-sm font-semibold ${
                    active ? 'text-white' : 'text-stone-500'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? (
        <View style={tw`mx-5 mb-2 px-3 py-2 rounded-xl bg-red-50 border border-red-100`}>
          <Text style={tw`text-sm text-red-700`}>{error}</Text>
        </View>
      ) : null}

      {viewTab === 'today' ? (
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
              tw`mx-5 mt-2 mb-4 rounded-3xl px-5 pt-5 pb-5 overflow-hidden`,
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
            <View
              pointerEvents="none"
              style={[
                tw`absolute -bottom-20 -left-12 w-56 h-56 rounded-full`,
                { backgroundColor: 'rgba(245,158,11,0.10)' },
              ]}
            />
            <View style={tw`flex-row items-start justify-between mb-4`}>
              <View style={tw`flex-1 pr-3`}>
                <Text style={tw`text-stone-500 text-sm`}>{formatHeroDate()}</Text>
                <Text style={tw`text-2xl text-stone-900 mt-2 leading-8`}>{todayPrompt}</Text>
              </View>
              {streak > 0 ? (
                <View style={tw`items-center`}>
                  <View
                    style={tw`w-14 h-14 rounded-full border-2 border-stone-900/20 items-center justify-center bg-white/50`}
                  >
                    <Text style={tw`text-lg font-bold text-stone-900`}>{streak}</Text>
                  </View>
                  <Text style={tw`text-[10px] text-stone-500 mt-1 font-medium`}>day streak</Text>
                </View>
              ) : null}
            </View>

            <MoodWeekStrip
              entries={entries}
              onSelectDay={(key) => {
                setFocusDateKey(key);
                setViewTab('timeline');
              }}
            />

            <Pressable
              onPress={() => {
                triggerPressFeedback();
                setComposeOpen(true);
              }}
              style={tw`mt-5 bg-stone-900 rounded-2xl py-3.5 items-center flex-row justify-center`}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={tw`text-white font-semibold ml-2`}>
                {todayEntries.length > 0 ? 'Write another entry' : "Write today's entry"}
              </Text>
            </Pressable>
          </View>

          <View style={tw`px-5 mb-2`}>
            <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
              Today
            </Text>
            {isLoading && entries.length === 0 ? (
              <ActivityIndicator color="#1C1917" style={tw`py-8`} />
            ) : todayEntries.length === 0 ? (
              <View style={tw`py-6 px-4 rounded-2xl bg-white/50 border border-dashed border-stone-300`}>
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
              <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
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
          contentContainerStyle={[
            tw`px-5 pt-2`,
            { paddingBottom: TAB_SCREEN_BOTTOM_PADDING },
          ]}
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
              <ScrollView
                horizontal
                {...horizontalScrollProps}
                style={tw`mt-3 mb-1`}
                contentContainerStyle={tw`gap-2 pr-2`}
              >
                {(
                  [
                    { key: 'all', label: 'All' },
                    { key: 'private', label: 'Private' },
                    { key: 'shared', label: 'Shared' },
                  ] as const
                ).map((f) => {
                  const active = visibility === f.key;
                  return (
                    <Pressable
                      key={f.key}
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
                    </Pressable>
                  );
                })}
                {focusDateKey ? (
                  <Pressable
                    onPress={() => setFocusDateKey(null)}
                    style={tw`px-3.5 py-1.5 rounded-full bg-amber-100 border border-amber-200 flex-row items-center`}
                  >
                    <Text style={tw`text-sm text-amber-900 mr-1`}>
                      {formatSectionTitle(focusDateKey)}
                    </Text>
                    <Ionicons name="close" size={14} color="#92400E" />
                  </Pressable>
                ) : null}
              </ScrollView>
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
                onAction={() => setComposeOpen(true)}
              />
            )
          }
        />
      )}

      <JournalComposeModal
        visible={composeOpen}
        isSaving={isSaving}
        initialPrompt={todayPrompt}
        preferredPath={userPath}
        onClose={() => setComposeOpen(false)}
        onSave={(payload) => void handleSave(payload)}
      />
    </SafeAreaView>
  );
}
