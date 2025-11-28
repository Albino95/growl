import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

type Student = {
  id: string;
  name: string;
  avatar: string;
  category: string;
  progress: number;
  lastActive: string;
  hasUnreadMessage: boolean;
  homeworkCount: number;
};

type Homework = {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  submittedAt?: string;
};

// Mock data - in real app, this would come from API
const MOCK_STUDENTS: Student[] = [
  {
    id: 's1',
    name: 'Alex',
    avatar: '👤',
    category: 'Fitness - Losing Weight',
    progress: 75,
    lastActive: '2h ago',
    hasUnreadMessage: true,
    homeworkCount: 2,
  },
  {
    id: 's2',
    name: 'Emma',
    avatar: '👩',
    category: 'Art - Piano',
    progress: 60,
    lastActive: '1d ago',
    hasUnreadMessage: false,
    homeworkCount: 1,
  },
  {
    id: 's3',
    name: 'David',
    avatar: '👨',
    category: 'Mindset - Meditation',
    progress: 45,
    lastActive: '3h ago',
    hasUnreadMessage: true,
    homeworkCount: 0,
  },
];

const MOCK_HOMEWORK: Homework[] = [
  {
    id: 'h1',
    studentId: 's1',
    studentName: 'Alex',
    title: 'Cardio Workout',
    description: 'Complete 30 minutes of cardio exercise',
    dueDate: '2024-01-15',
    status: 'completed',
    submittedAt: '2024-01-14',
  },
  {
    id: 'h2',
    studentId: 's1',
    studentName: 'Alex',
    title: 'Meal Planning',
    description: 'Plan meals for the week',
    dueDate: '2024-01-16',
    status: 'pending',
  },
  {
    id: 'h3',
    studentId: 's2',
    studentName: 'Emma',
    title: 'Practice Scales',
    description: 'Practice C major scale for 20 minutes',
    dueDate: '2024-01-15',
    status: 'overdue',
  },
];

export default function InstructorScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'students' | 'homework' | 'income' | 'messages'>('students');
  const [students] = useState<Student[]>(MOCK_STUDENTS);
  const [homework] = useState<Homework[]>(MOCK_HOMEWORK);
  
  const totalEarnings = 1250.50;
  const monthlyEarnings = 450.75;
  const pendingPayouts = 125.00;

  if (!user?.isInstructor) {
    return (
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Ionicons name="school-outline" size={64} color="#D1D5DB" />
          <Text style={tw`text-xl font-bold text-gray-900 mt-4 mb-2`}>Become an Instructor</Text>
          <Text style={tw`text-gray-600 text-center mb-6`}>
            You need at least 500 points and community votes to become an instructor.
          </Text>
          <Text style={tw`text-sm text-gray-500`}>
            Current Points: {user?.points || 0}/500
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-3 border-b border-gray-200`}>
          <Text style={tw`text-3xl font-bold text-green-600 mb-2`}>Instructor Dashboard</Text>
          <Text style={tw`text-gray-600`}>Manage your students and track their progress</Text>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`border-b border-gray-200`}>
          <View style={tw`flex-row`}>
            {[
              { key: 'students', label: 'Students', icon: 'people' },
              { key: 'homework', label: 'Homework', icon: 'document-text' },
              { key: 'income', label: 'Income', icon: 'cash' },
              { key: 'messages', label: 'Messages', icon: 'chatbubbles' },
            ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              style={tw`flex-1 py-3 items-center border-b-2 ${
                activeTab === tab.key ? 'border-green-600' : 'border-transparent'
              }`}
            >
              <Ionicons
                name={tab.icon as any}
                size={20}
                color={activeTab === tab.key ? '#10B981' : '#9CA3AF'}
              />
              <Text
                style={tw`text-xs mt-1 ${
                  activeTab === tab.key ? 'text-green-600 font-semibold' : 'text-gray-500'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
          </View>
        </ScrollView>

        {/* Content */}
        {activeTab === 'students' && (
          <FlatList
            data={students}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`p-4`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}
                onPress={() => {
                  // Navigate to student detail
                  alert(`View ${item.name}'s profile`);
                }}
              >
                <View style={tw`flex-row items-center mb-3`}>
                  <View style={tw`w-12 h-12 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                    <Text style={tw`text-2xl`}>{item.avatar}</Text>
                  </View>
                  <View style={tw`flex-1`}>
                    <View style={tw`flex-row items-center`}>
                      <Text style={tw`text-lg font-semibold text-gray-900`}>{item.name}</Text>
                      {item.hasUnreadMessage && (
                        <View style={tw`w-2 h-2 bg-green-500 rounded-full ml-2`} />
                      )}
                    </View>
                    <Text style={tw`text-sm text-gray-500`}>{item.category}</Text>
                  </View>
                </View>

                <View style={tw`mb-2`}>
                  <View style={tw`flex-row items-center justify-between mb-1`}>
                    <Text style={tw`text-sm text-gray-600`}>Progress</Text>
                    <Text style={tw`text-sm font-semibold text-green-600`}>{item.progress}%</Text>
                  </View>
                  <View style={tw`h-2 bg-gray-200 rounded-full overflow-hidden`}>
                    <View
                      style={[tw`h-full bg-green-500 rounded-full`, { width: `${item.progress}%` }]}
                    />
                  </View>
                </View>

                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-xs text-gray-500`}>Last active: {item.lastActive}</Text>
                  {item.homeworkCount > 0 && (
                    <View style={tw`bg-yellow-100 px-2 py-1 rounded-full`}>
                      <Text style={tw`text-xs text-yellow-800`}>
                        {item.homeworkCount} homework{item.homeworkCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {activeTab === 'homework' && (
          <FlatList
            data={homework}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`p-4`}
            renderItem={({ item }) => (
              <View
                style={tw`bg-white border-2 rounded-xl p-4 mb-3 ${
                  item.status === 'completed'
                    ? 'border-green-200 bg-green-50'
                    : item.status === 'overdue'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200'
                }`}
              >
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`font-semibold text-gray-900`}>{item.title}</Text>
                  <View
                    style={tw`px-2 py-1 rounded-full ${
                      item.status === 'completed'
                        ? 'bg-green-100'
                        : item.status === 'overdue'
                        ? 'bg-red-100'
                        : 'bg-yellow-100'
                    }`}
                  >
                    <Text
                      style={tw`text-xs font-medium ${
                        item.status === 'completed'
                          ? 'text-green-800'
                          : item.status === 'overdue'
                          ? 'text-red-800'
                          : 'text-yellow-800'
                      }`}
                    >
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={tw`text-sm text-gray-600 mb-2`}>{item.description}</Text>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-xs text-gray-500`}>Student: {item.studentName}</Text>
                  <Text style={tw`text-xs text-gray-500`}>Due: {item.dueDate}</Text>
                </View>
                {item.submittedAt && (
                  <Text style={tw`text-xs text-green-600 mt-1`}>
                    Submitted: {item.submittedAt}
                  </Text>
                )}
              </View>
            )}
          />
        )}

        {activeTab === 'income' && (
          <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
            {/* Income Overview */}
            <View style={tw`bg-green-500 rounded-xl p-6 mb-4`}>
              <Text style={tw`text-white text-sm mb-2 opacity-90`}>Total Earnings</Text>
              <Text style={tw`text-white text-4xl font-bold mb-4`}>${totalEarnings.toFixed(2)}</Text>
              <View style={tw`flex-row justify-between`}>
                <View>
                  <Text style={tw`text-white text-xs opacity-90`}>This Month</Text>
                  <Text style={tw`text-white text-xl font-bold`}>${monthlyEarnings.toFixed(2)}</Text>
                </View>
                <View>
                  <Text style={tw`text-white text-xs opacity-90`}>Pending</Text>
                  <Text style={tw`text-white text-xl font-bold`}>${pendingPayouts.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* Income Breakdown */}
            <View style={tw`bg-white rounded-xl p-4 mb-4 border border-gray-200`}>
              <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Income Breakdown</Text>
              <View style={tw`gap-3`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="people" size={20} color="#10B981" />
                    <Text style={tw`text-gray-700 ml-2`}>Student Subscriptions</Text>
                  </View>
                  <Text style={tw`font-bold text-gray-900`}>$850.00</Text>
                </View>
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="book" size={20} color="#3B82F6" />
                    <Text style={tw`text-gray-700 ml-2`}>Course Sales</Text>
                  </View>
                  <Text style={tw`font-bold text-gray-900`}>$250.50</Text>
                </View>
                <View style={tw`flex-row items-center justify-between`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="star" size={20} color="#A855F7" />
                    <Text style={tw`text-gray-700 ml-2`}>Premium Subscriptions</Text>
                  </View>
                  <Text style={tw`font-bold text-gray-900`}>$150.00</Text>
                </View>
              </View>
            </View>

            {/* Recent Transactions */}
            <View style={tw`bg-white rounded-xl p-4 border border-gray-200`}>
              <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Recent Transactions</Text>
              {[
                { id: '1', type: 'Commission', amount: 45.50, date: '2024-01-15', status: 'paid' },
                { id: '2', type: 'Subscription', amount: 50.00, date: '2024-01-14', status: 'paid' },
                { id: '3', type: 'Commission', amount: 25.00, date: '2024-01-13', status: 'pending' },
              ].map((transaction) => (
                <View key={transaction.id} style={tw`flex-row items-center justify-between py-3 border-b border-gray-100 last:border-b-0`}>
                  <View>
                    <Text style={tw`font-semibold text-gray-900`}>{transaction.type}</Text>
                    <Text style={tw`text-sm text-gray-500`}>{transaction.date}</Text>
                  </View>
                  <View style={tw`items-end`}>
                    <Text style={tw`font-bold text-gray-900`}>${transaction.amount.toFixed(2)}</Text>
                    <View style={tw`px-2 py-0.5 rounded-full ${
                      transaction.status === 'paid' ? 'bg-green-100' : 'bg-yellow-100'
                    } mt-1`}>
                      <Text style={tw`text-xs font-semibold ${
                        transaction.status === 'paid' ? 'text-green-700' : 'text-yellow-700'
                      }`}>
                        {transaction.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={tw`bg-purple-600 rounded-xl py-4 mt-4`}>
              <Text style={tw`text-white text-center font-bold text-base`}>Request Payout</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'messages' && (
          <View style={tw`flex-1 items-center justify-center p-6`}>
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Text style={tw`text-gray-500 mt-4 text-center`}>
              Messages from students will appear here
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

