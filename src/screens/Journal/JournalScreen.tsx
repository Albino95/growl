import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

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

  const filteredEntries = entries.filter((entry) =>
    activeTab === 'public' ? entry.isPublic : !entry.isPublic
  );

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
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-3 border-b border-gray-200`}>
          <View style={tw`flex-row items-center justify-between mb-3`}>
            <Text style={tw`text-3xl font-bold text-green-600`}>Journal</Text>
            <TouchableOpacity
              onPress={() => setShowNewEntry(!showNewEntry)}
              style={tw`bg-green-600 px-4 py-2 rounded-full`}
            >
              <Ionicons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={tw`text-gray-600`}>
            Track your journey. Public entries can inspire others, private entries are for you and AI.
          </Text>
        </View>

        {/* Tabs */}
        <View style={tw`flex-row border-b border-gray-200`}>
          <TouchableOpacity
            onPress={() => setActiveTab('public')}
            style={tw`flex-1 py-3 items-center border-b-2 ${
              activeTab === 'public' ? 'border-green-600' : 'border-transparent'
            }`}
          >
            <Ionicons
              name="globe"
              size={20}
              color={activeTab === 'public' ? '#10B981' : '#9CA3AF'}
            />
            <Text
              style={tw`text-sm mt-1 ${
                activeTab === 'public' ? 'text-green-600 font-semibold' : 'text-gray-500'
              }`}
            >
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('private')}
            style={tw`flex-1 py-3 items-center border-b-2 ${
              activeTab === 'private' ? 'border-green-600' : 'border-transparent'
            }`}
          >
            <Ionicons
              name="lock-closed"
              size={20}
              color={activeTab === 'private' ? '#10B981' : '#9CA3AF'}
            />
            <Text
              style={tw`text-sm mt-1 ${
                activeTab === 'private' ? 'text-green-600 font-semibold' : 'text-gray-500'
              }`}
            >
              Private
            </Text>
          </TouchableOpacity>
        </View>

        {/* New Entry Form */}
        {showNewEntry && (
          <View style={tw`p-4 border-b border-gray-200 bg-gray-50`}>
            <TextInput
              placeholder="What's on your mind?"
              multiline
              value={newEntry}
              onChangeText={setNewEntry}
              style={tw`border border-gray-300 rounded-xl p-3 text-base mb-3 min-h-32 bg-white`}
              placeholderTextColor="#9CA3AF"
            />
            <View style={tw`flex-row items-center justify-between`}>
              <TouchableOpacity
                onPress={() => setIsPublic(!isPublic)}
                style={tw`flex-row items-center`}
              >
                <Ionicons
                  name={isPublic ? 'globe' : 'lock-closed'}
                  size={20}
                  color={isPublic ? '#10B981' : '#6B7280'}
                />
                <Text style={tw`ml-2 text-sm text-gray-700`}>
                  {isPublic ? 'Public' : 'Private'}
                </Text>
              </TouchableOpacity>
              <View style={tw`flex-row gap-2`}>
                <TouchableOpacity
                  onPress={() => {
                    setShowNewEntry(false);
                    setNewEntry('');
                  }}
                  style={tw`px-4 py-2 rounded-lg bg-gray-200`}
                >
                  <Text style={tw`text-gray-700 font-medium`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddEntry}
                  style={tw`px-4 py-2 rounded-lg bg-green-600`}
                >
                  <Text style={tw`text-white font-medium`}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={tw`text-xs text-gray-500 mt-2`}>
              Date will be automatically set by the system
            </Text>
          </View>
        )}

        {/* Entries List */}
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tw`p-4`}
          renderItem={({ item }) => (
            <View style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}>
              <View style={tw`flex-row items-center justify-between mb-2`}>
                <Text style={tw`text-sm font-semibold text-gray-500`}>
                  {formatDate(item.date)}
                </Text>
                <View style={tw`flex-row items-center`}>
                  <Ionicons
                    name={item.isPublic ? 'globe' : 'lock-closed'}
                    size={16}
                    color={item.isPublic ? '#10B981' : '#6B7280'}
                  />
                  <Text style={tw`text-xs text-gray-500 ml-1`}>
                    {item.isPublic ? 'Public' : 'Private'}
                  </Text>
                </View>
              </View>
              <Text style={tw`text-gray-900 leading-6`}>{item.content}</Text>
              {item.mood && (
                <View style={tw`mt-2 flex-row items-center`}>
                  <Ionicons name="happy-outline" size={16} color="#6B7280" />
                  <Text style={tw`text-xs text-gray-500 ml-1`}>Mood: {item.mood}</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={tw`items-center justify-center py-12`}>
              <Ionicons name="book-outline" size={64} color="#D1D5DB" />
              <Text style={tw`text-gray-500 mt-4 text-center`}>
                No {activeTab} entries yet. Start journaling to track your journey!
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

