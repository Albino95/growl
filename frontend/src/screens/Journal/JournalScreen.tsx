import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';
import SearchField from '../../components/ui/SearchField';
import EmptyState from '../../components/ui/EmptyState';
import { verticalScrollProps, feedListPerformanceProps } from '../../constants/scroll';

type JournalEntry = {
  id: string;
  date: string;
  content: string;
  isPublic: boolean;
  mood?: string;
  tags?: string[];
};

// Mock data - in real app, this would come from API
const MOCK_ENTRIES: JournalEntry[] = [
  {
    id: '1',
    date: '2024-01-15',
    content: 'Had a great workout today! Feeling motivated and strong.',
    isPublic: true,
    mood: 'excited',
    tags: ['fitness', 'progress'],
  },
  {
    id: '2',
    date: '2024-01-14',
    content: 'Struggled with motivation today but pushed through. Small wins matter.',
    isPublic: false,
    mood: 'determined',
    tags: ['mindset'],
  },
  {
    id: '3',
    date: '2024-01-13',
    content: 'Completed my first week of consistent practice. Proud of the progress!',
    isPublic: true,
    mood: 'proud',
    tags: ['milestone'],
  },
];

export default function JournalScreen() {
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [entries, setEntries] = useState<JournalEntry[]>(MOCK_ENTRIES);
  const [newEntry, setNewEntry] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Sync isPublic with activeTab when opening new entry form
  const handleToggleNewEntry = () => {
    setIsPublic(activeTab === 'public');
    setShowNewEntry(!showNewEntry);
  };

  // Sync isPublic when tab changes while form is open
  useEffect(() => {
    if (showNewEntry) {
      setIsPublic(activeTab === 'public');
    }
  }, [activeTab, showNewEntry]);

  const filteredEntries = useMemo(() => {
    const byTab = entries.filter((entry) => (activeTab === 'public' ? entry.isPublic : !entry.isPublic));
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        (e.tags && e.tags.some((t) => t.toLowerCase().includes(q))) ||
        (e.mood && e.mood.toLowerCase().includes(q))
    );
  }, [entries, activeTab, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleAddEntry = () => {
    if (!newEntry.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    const entry: JournalEntry = {
      id: Date.now().toString(),
      date: today,
      content: newEntry,
      isPublic,
    };

    setEntries([entry, ...entries]);
    setNewEntry('');
    setShowNewEntry(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top']}>
      <View style={tw`flex-1`}>
        <View style={tw`px-4 pt-3 pb-3 border-b border-stone-100 bg-white`}>
          <View style={tw`flex-row items-center justify-between mb-2`}>
            <Text style={tw`text-2xl font-bold text-emerald-700`}>Journal</Text>
            <TouchableOpacity
              onPress={handleToggleNewEntry}
              style={tw`bg-emerald-600 px-4 py-2.5 rounded-full shadow-sm`}
            >
              <Ionicons name={showNewEntry ? 'close' : 'add'} size={22} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={tw`text-sm text-stone-500`}>
            Reflect in public or private. Search filters entries by text, tags, or mood.
          </Text>
        </View>

        <View style={tw`flex-row border-b border-stone-100 bg-white`}>
          <TouchableOpacity
            onPress={() => setActiveTab('public')}
            style={tw`flex-1 py-3 items-center border-b-2 ${
              activeTab === 'public' ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            <Ionicons name="globe" size={20} color={activeTab === 'public' ? '#059669' : '#A8A29E'} />
            <Text
              style={tw`text-sm mt-1 ${
                activeTab === 'public' ? 'text-emerald-700 font-semibold' : 'text-stone-500'
              }`}
            >
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('private')}
            style={tw`flex-1 py-3 items-center border-b-2 ${
              activeTab === 'private' ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            <Ionicons name="lock-closed" size={20} color={activeTab === 'private' ? '#059669' : '#A8A29E'} />
            <Text
              style={tw`text-sm mt-1 ${
                activeTab === 'private' ? 'text-emerald-700 font-semibold' : 'text-stone-500'
              }`}
            >
              Private
            </Text>
          </TouchableOpacity>
        </View>

        {showNewEntry ? (
          <View style={tw`p-4 border-b border-stone-100 bg-stone-100/80`}>
            <TextInput
              placeholder="What's on your mind?"
              multiline
              value={newEntry}
              onChangeText={setNewEntry}
              style={tw`border border-stone-200 rounded-2xl p-3 text-base mb-3 min-h-32 bg-white text-stone-900`}
              placeholderTextColor="#A8A29E"
            />
            <View style={tw`flex-row items-center justify-between`}>
              <TouchableOpacity onPress={() => setIsPublic(!isPublic)} style={tw`flex-row items-center`}>
                <Ionicons name={isPublic ? 'globe' : 'lock-closed'} size={20} color={isPublic ? '#059669' : '#78716C'} />
                <Text style={tw`ml-2 text-sm text-stone-700`}>{isPublic ? 'Public' : 'Private'}</Text>
              </TouchableOpacity>
              <View style={tw`flex-row gap-2`}>
                <TouchableOpacity
                  onPress={() => {
                    setShowNewEntry(false);
                    setNewEntry('');
                  }}
                  style={tw`px-4 py-2 rounded-xl bg-stone-200`}
                >
                  <Text style={tw`text-stone-700 font-medium`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddEntry} style={tw`px-4 py-2 rounded-xl bg-emerald-600`}>
                  <Text style={tw`text-white font-medium`}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`px-4 pt-3 pb-28`}
          {...feedListPerformanceProps}
          {...verticalScrollProps}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" colors={['#059669']} />
          }
          ListHeaderComponent={
            !showNewEntry ? (
              <SearchField value={searchQuery} onChangeText={setSearchQuery} placeholder="Search entries, tags, mood" />
            ) : null
          }
          renderItem={({ item }) => (
            <View style={tw`bg-white border border-stone-100 rounded-2xl p-4 mb-3`}>
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <Text style={tw`text-xs font-semibold text-stone-500`}>{formatDate(item.date)}</Text>
                <View style={tw`flex-row items-center`}>
                  <Ionicons
                    name={item.isPublic ? 'globe' : 'lock-closed'}
                    size={15}
                    color={item.isPublic ? '#059669' : '#78716C'}
                  />
                  <Text style={tw`text-xs text-stone-500 ml-1`}>{item.isPublic ? 'Public' : 'Private'}</Text>
                </View>
              </View>
              <Text style={tw`text-stone-900 leading-6`}>{item.content}</Text>
              {item.mood ? (
                <View style={tw`mt-2 flex-row items-center`}>
                  <Ionicons name="happy-outline" size={16} color="#78716C" />
                  <Text style={tw`text-xs text-stone-500 ml-1`}>Mood: {item.mood}</Text>
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            searchQuery.trim() ? (
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
                description="Tap + to capture a moment. Entries stay organized by visibility."
                actionLabel="New entry"
                onAction={handleToggleNewEntry}
              />
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

