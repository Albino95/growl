import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import { verticalScrollProps, feedListPerformanceProps } from '../../constants/scroll';
import { useAppDispatch, useAppSelector } from '../../store/store';
import { useAuth } from '../../store/hooks';
import { reportContent } from '../../services/api/friends';
import {
  fetchJournalEntries,
  addJournalEntry,
  removeJournalEntry,
  type JournalMood,
} from '../../store/slices/journalSlice';

const MOOD_CHIPS: { key: JournalMood; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'happy', label: 'Happy', icon: 'happy-outline' },
  { key: 'excited', label: 'Excited', icon: 'flash-outline' },
  { key: 'calm', label: 'Calm', icon: 'leaf-outline' },
  { key: 'grateful', label: 'Grateful', icon: 'heart-outline' },
  { key: 'proud', label: 'Proud', icon: 'trophy-outline' },
  { key: 'motivated', label: 'Motivated', icon: 'fitness-outline' },
  { key: 'peaceful', label: 'Peaceful', icon: 'water-outline' },
  { key: 'determined', label: 'Determined', icon: 'flame-outline' },
  { key: 'tired', label: 'Tired', icon: 'moon-outline' },
  { key: 'sad', label: 'Sad', icon: 'rainy-outline' },
  { key: 'anxious', label: 'Anxious', icon: 'pulse-outline' },
];

type DateSection = {
  title: string;
  dateKey: string;
  data: Array<{
    id: string;
    userId: string;
    content: string;
    isPublic: boolean;
    mood?: string | null;
    tags: string[];
    created_at: string;
  }>;
};

function dateKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function formatSectionTitle(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const today = new Date();
  const todayKey = dateKeyFromIso(today.toISOString());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dateKeyFromIso(yesterday.toISOString());

  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function JournalScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const { entries, isLoading, isSaving, error } = useAppSelector((s) => s.journal);

  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [composeOpen, setComposeOpen] = useState(false);
  const [content, setContent] = useState('');
  const [selectedMood, setSelectedMood] = useState<JournalMood | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadEntries = useCallback(async () => {
    await dispatch(fetchJournalEntries(activeTab)).unwrap();
  }, [dispatch, activeTab]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (composeOpen) {
      setIsPublic(activeTab === 'public');
    }
  }, [activeTab, composeOpen]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)) ||
        (e.mood && e.mood.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  const sections: DateSection[] = useMemo(() => {
    const grouped = new Map<string, DateSection['data']>();
    for (const entry of filteredEntries) {
      const key = dateKeyFromIso(entry.created_at);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({
        id: entry.id,
        userId: entry.user_id,
        content: entry.content,
        isPublic: entry.isPublic,
        mood: entry.mood,
        tags: entry.tags,
        created_at: entry.created_at,
      });
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([dateKey, data]) => ({
        title: formatSectionTitle(dateKey),
        dateKey,
        data,
      }));
  }, [filteredEntries]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadEntries();
    } finally {
      setRefreshing(false);
    }
  };

  const openCompose = () => {
    setContent('');
    setSelectedMood(null);
    setIsPublic(activeTab === 'public');
    setComposeOpen(true);
  };

  const handleSave = async () => {
    if (!content.trim() || isSaving) return;
    try {
      await dispatch(
        addJournalEntry({
          content: content.trim(),
          mood: selectedMood ?? undefined,
          is_public: isPublic,
        })
      ).unwrap();
      setComposeOpen(false);
      setContent('');
      setSelectedMood(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save entry';
      Alert.alert('Error', msg);
    }
  };

  const handleReport = (entryId: string) => {
    Alert.alert('Report entry', 'Why are you reporting this journal entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Spam',
        onPress: () =>
          void reportContent(entryId, 'journal', 'spam').then(() =>
            Alert.alert('Reported', 'Thank you. We will review this entry.')
          ),
      },
      {
        text: 'Inappropriate',
        onPress: () =>
          void reportContent(entryId, 'journal', 'inappropriate_content').then(() =>
            Alert.alert('Reported', 'Thank you. We will review this entry.')
          ),
      },
    ]);
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
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`flex-1`}>
        <View style={tw`px-4 pt-3 pb-3 border-b border-stone-100 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-2xl font-bold text-emerald-700`}>Journal</Text>
            <TouchableOpacity
              onPress={openCompose}
              style={tw`bg-emerald-600 px-4 py-2.5 rounded-full shadow-sm`}
            >
              <Ionicons name="add" size={22} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={tw`text-sm text-stone-500`}>
            Reflect in public or private. Entries are grouped by date.
          </Text>
        </View>

        <View style={tw`flex-row border-b border-stone-100 bg-white`}>
          {(['public', 'private'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={tw`flex-1 py-3 items-center border-b-2 ${
                activeTab === tab ? 'border-emerald-600' : 'border-transparent'
              }`}
            >
              <Ionicons
                name={tab === 'public' ? 'globe' : 'lock-closed'}
                size={20}
                color={activeTab === tab ? '#059669' : '#A8A29E'}
              />
              <Text
                style={tw`text-sm mt-1 ${
                  activeTab === tab ? 'text-emerald-700 font-semibold' : 'text-stone-500'
                }`}
              >
                {tab === 'public' ? 'Public' : 'Private'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? (
          <View style={tw`px-4 py-2 bg-red-50 border-b border-red-100`}>
            <Text style={tw`text-sm text-red-700`}>{error}</Text>
          </View>
        ) : null}

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-4 pt-3 pb-28`}
          stickySectionHeadersEnabled
          {...feedListPerformanceProps}
          {...verticalScrollProps}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor="#059669"
              colors={['#059669']}
            />
          }
          ListHeaderComponent={
            <SearchField
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search entries, tags, mood"
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={tw`py-2 bg-stone-50`}>
              <Text style={tw`text-sm font-semibold text-stone-600`}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}>
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <Text style={tw`text-xs text-stone-400`}>
                  {new Date(item.created_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
                <View style={tw`flex-row items-center gap-2`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons
                      name={item.isPublic ? 'globe' : 'lock-closed'}
                      size={14}
                      color={item.isPublic ? '#059669' : '#78716C'}
                    />
                  </View>
                  {item.userId === user?.id ? (
                    <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color="#A8A29E" />
                    </TouchableOpacity>
                  ) : activeTab === 'public' ? (
                    <TouchableOpacity onPress={() => handleReport(item.id)} hitSlop={8}>
                      <Ionicons name="flag-outline" size={16} color="#A8A29E" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <Text style={tw`text-stone-900 leading-6`}>{item.content}</Text>
              {item.mood ? (
                <View style={tw`mt-2 self-start bg-emerald-50 px-2.5 py-1 rounded-full flex-row items-center`}>
                  <Ionicons name="happy-outline" size={14} color="#059669" />
                  <Text style={tw`text-xs text-emerald-700 ml-1 capitalize`}>{item.mood}</Text>
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            isLoading ? (
              <View style={tw`py-12 items-center`}>
                <ActivityIndicator color="#059669" />
              </View>
            ) : searchQuery.trim() ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                description="Try a shorter phrase or clear search."
                actionLabel="Clear search"
                onAction={() => setSearchQuery('')}
              />
            ) : (
              <EmptyState
                icon="book-outline"
                title={`No ${activeTab} entries yet`}
                description="Tap + to capture a moment. Entries stay organized by visibility and date."
                actionLabel="New entry"
                onAction={openCompose}
              />
            )
          }
        />
      </View>

      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <View style={tw`flex-1 justify-end`}>
          <Pressable style={tw`absolute inset-0 bg-black/35`} onPress={() => setComposeOpen(false)} />
          <View style={tw`bg-white rounded-t-3xl px-4 pt-4 pb-8 max-h-[85%]`}>
            <View style={tw`w-12 h-1.5 bg-stone-300 rounded-full self-center mb-4`} />
            <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>New entry</Text>

            <TextInput
              placeholder="What's on your mind?"
              multiline
              value={content}
              onChangeText={setContent}
              style={tw`border border-stone-200 rounded-2xl p-3 text-base mb-3 min-h-32 bg-stone-50 text-stone-900`}
              placeholderTextColor="#A8A29E"
              textAlignVertical="top"
            />

            <Text style={tw`text-sm font-medium text-stone-600 mb-2`}>Mood</Text>
            <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
              {MOOD_CHIPS.map((chip) => {
                const selected = selectedMood === chip.key;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    onPress={() => setSelectedMood(selected ? null : chip.key)}
                    style={tw`flex-row items-center px-3 py-1.5 rounded-full border ${
                      selected ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-stone-200'
                    }`}
                  >
                    <Ionicons name={chip.icon} size={14} color={selected ? '#fff' : '#57534E'} />
                    <Text style={tw`text-xs ml-1 ${selected ? 'text-white' : 'text-stone-700'}`}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={tw`flex-row items-center justify-between`}>
              <TouchableOpacity onPress={() => setIsPublic(!isPublic)} style={tw`flex-row items-center`}>
                <Ionicons
                  name={isPublic ? 'globe' : 'lock-closed'}
                  size={20}
                  color={isPublic ? '#059669' : '#78716C'}
                />
                <Text style={tw`ml-2 text-sm text-stone-700`}>{isPublic ? 'Public' : 'Private'}</Text>
              </TouchableOpacity>
              <View style={tw`flex-row gap-2`}>
                <TouchableOpacity
                  onPress={() => setComposeOpen(false)}
                  style={tw`px-4 py-2 rounded-xl bg-stone-200`}
                >
                  <Text style={tw`text-stone-700 font-medium`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => void handleSave()}
                  disabled={!content.trim() || isSaving}
                  style={tw`px-4 py-2 rounded-xl bg-emerald-600 ${!content.trim() || isSaving ? 'opacity-50' : ''}`}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={tw`text-white font-medium`}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
