import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import {
  claimInstructor,
  getInstructorEligibility,
  type InstructorEligibility,
} from '../../services/api/instructor';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
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
  const { user, updateUser, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'students' | 'homework' | 'income' | 'messages'>('students');
  const [students] = useState<Student[]>(MOCK_STUDENTS);
  const [homework] = useState<Homework[]>(MOCK_HOMEWORK);
  const [eligibility, setEligibility] = useState<InstructorEligibility | null>(null);
  const [loadingElig, setLoadingElig] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);

  const totalEarnings = 1250.5;
  const monthlyEarnings = 450.75;
  const pendingPayouts = 125.0;

  const loadEligibility = useCallback(async () => {
    setLoadingElig(true);
    try {
      const elig = await getInstructorEligibility();
      setEligibility(elig);
    } catch {
      setEligibility(null);
    } finally {
      setLoadingElig(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!user?.isInstructor) {
        void loadEligibility();
      } else {
        setLoadingElig(false);
      }
    }, [user?.isInstructor, loadEligibility])
  );

  const onClaim = async () => {
    if (!eligibility?.canClaim || claimBusy) return;
    const ok = await confirmAsync(
      'Switch to Instructor Account?',
      'You have enough peer endorsements and posts. Claim to unlock this hub.',
      { confirmLabel: 'Claim instructor' }
    );
    if (!ok) return;
    setClaimBusy(true);
    try {
      const result = await claimInstructor();
      updateUser({ isInstructor: true });
      await refreshProfile();
      setEligibility(result);
      alertMessage('Welcome', 'You’re an instructor. Explore the Instructor Hub below.');
    } catch (e) {
      alertMessage('Could not claim', e instanceof Error ? e.message : 'Try again');
    } finally {
      setClaimBusy(false);
    }
  };

  if (!user?.isInstructor) {
    return (
      <SafeAreaView style={tw`flex-1 bg-surface-page`}>
        <View style={tw`flex-1 px-6 justify-center`}>
          <View style={tw`items-center mb-6`}>
            <View style={tw`w-16 h-16 rounded-full bg-emerald-600/12 items-center justify-center mb-2`}>
              <Ionicons name="school-outline" size={36} color="#059669" />
            </View>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Grow!
            </Text>
            <Text style={tw`text-xl font-bold text-stone-900 mt-2 mb-2`}>Instructor Hub</Text>
            <Text style={tw`text-stone-600 text-center leading-5`}>
              Peers in your growth areas can endorse you. When you hit the thresholds, claim access to the
              Instructor Hub in one tap.
            </Text>
          </View>

          {loadingElig ? (
            <ActivityIndicator color="#059669" />
          ) : eligibility ? (
            <View style={tw`bg-white border border-stone-200 rounded-2xl p-5`}>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Endorsements {eligibility.endorsementsReceived}/{eligibility.endorsementsNeeded}
              </Text>
              <View style={tw`h-2 bg-stone-100 rounded-full mb-4 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-brand-600`,
                    {
                      width: `${Math.min(
                        (eligibility.endorsementsReceived / eligibility.endorsementsNeeded) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={tw`text-sm text-stone-500 mb-1`}>
                Posts {eligibility.postCount}/{eligibility.postsNeeded}
              </Text>
              <View style={tw`h-2 bg-stone-100 rounded-full mb-4 overflow-hidden`}>
                <View
                  style={[
                    tw`h-full bg-violet-500`,
                    {
                      width: `${Math.min(
                        (eligibility.postCount / Math.max(eligibility.postsNeeded, 1)) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
              {eligibility.canClaim ? (
                <TouchableOpacity
                  onPress={() => void onClaim()}
                  disabled={claimBusy}
                  style={tw`bg-brand-600 rounded-xl py-3.5 items-center ${claimBusy ? 'opacity-60' : ''}`}
                >
                  <Text style={tw`text-white font-bold`}>
                    {claimBusy ? 'Claiming…' : 'Switch to Instructor Account'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={tw`text-sm text-stone-500 text-center`}>
                  Keep sharing progress and ask people in your categories to endorse you from your public profile.
                </Text>
              )}
            </View>
          ) : (
            <Text style={tw`text-center text-stone-500`}>Could not load eligibility. Pull to refresh later.</Text>
          )}

          <TouchableOpacity onPress={() => navigation.goBack?.()} style={tw`mt-6 items-center`}>
            <Text style={tw`text-brand-700 font-semibold`}>Back to profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-1`}>
        <View style={tw`px-5 pt-4 pb-3`}>
          <View style={tw`flex-row items-start justify-between`}>
            <View style={tw`flex-1 pr-3`}>
              <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
                Grow!
              </Text>
              <Text style={tw`text-2xl font-bold text-stone-900 mt-1`}>Instructor Hub</Text>
              <Text style={tw`text-sm text-stone-500 mt-1 leading-5`}>
                Students, homework, and earnings in one place.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.goBack?.()}
              style={tw`w-10 h-10 rounded-full bg-white border border-stone-200 items-center justify-center`}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color="#1C1917" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`border-b border-stone-200/80`}>
          <View style={tw`flex-row px-3`}>
            {[
              { key: 'students', label: 'Students', icon: 'people' },
              { key: 'homework', label: 'Homework', icon: 'document-text' },
              { key: 'income', label: 'Income', icon: 'cash' },
              { key: 'messages', label: 'Messages', icon: 'chatbubbles' },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as typeof activeTab)}
                style={tw`px-3.5 py-3 flex-row items-center border-b-2 ${
                  activeTab === tab.key ? 'border-emerald-600' : 'border-transparent'
                }`}
              >
                <Ionicons
                  name={tab.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={activeTab === tab.key ? '#059669' : '#A8A29E'}
                />
                <Text
                  style={tw`ml-2 font-semibold ${
                    activeTab === tab.key ? 'text-emerald-700' : 'text-stone-500'
                  }`}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {activeTab === 'students' && (
          <FlatList
            data={students}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`p-4`}
            renderItem={({ item }) => (
              <View style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}>
                <View style={tw`flex-row items-center`}>
                  <Text style={tw`text-3xl mr-3`}>{item.avatar}</Text>
                  <View style={tw`flex-1`}>
                    <Text style={tw`font-bold text-gray-900`}>{item.name}</Text>
                    <Text style={tw`text-sm text-gray-500`}>{item.category}</Text>
                    <Text style={tw`text-xs text-gray-400 mt-1`}>Active {item.lastActive}</Text>
                  </View>
                  {item.hasUnreadMessage ? (
                    <View style={tw`w-2.5 h-2.5 rounded-full bg-green-500`} />
                  ) : null}
                </View>
                <View style={tw`mt-3`}>
                  <Text style={tw`text-xs text-gray-500 mb-1`}>Progress {item.progress}%</Text>
                  <View style={tw`h-2 bg-gray-100 rounded-full overflow-hidden`}>
                    <View style={[tw`h-full bg-green-500`, { width: `${item.progress}%` }]} />
                  </View>
                </View>
              </View>
            )}
          />
        )}

        {activeTab === 'homework' && (
          <FlatList
            data={homework}
            keyExtractor={(item) => item.id}
            contentContainerStyle={tw`p-4`}
            renderItem={({ item }) => (
              <View style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}>
                <Text style={tw`font-bold text-gray-900`}>{item.title}</Text>
                <Text style={tw`text-sm text-gray-600 mt-1`}>{item.description}</Text>
                <Text style={tw`text-xs text-gray-400 mt-2`}>
                  {item.studentName} · Due {item.dueDate} · {item.status}
                </Text>
              </View>
            )}
          />
        )}

        {activeTab === 'income' && (
          <View style={tw`p-4`}>
            <View style={tw`bg-green-50 border border-green-200 rounded-xl p-4 mb-3`}>
              <Text style={tw`text-sm text-green-800`}>Total earnings</Text>
              <Text style={tw`text-3xl font-bold text-green-700`}>${totalEarnings.toFixed(2)}</Text>
            </View>
            <View style={tw`bg-white border border-gray-200 rounded-xl p-4 mb-3`}>
              <Text style={tw`text-sm text-gray-500`}>This month</Text>
              <Text style={tw`text-2xl font-bold text-gray-900`}>${monthlyEarnings.toFixed(2)}</Text>
            </View>
            <View style={tw`bg-white border border-gray-200 rounded-xl p-4`}>
              <Text style={tw`text-sm text-gray-500`}>Pending payouts</Text>
              <Text style={tw`text-2xl font-bold text-gray-900`}>${pendingPayouts.toFixed(2)}</Text>
            </View>
          </View>
        )}

        {activeTab === 'messages' && (
          <View style={tw`flex-1 items-center justify-center p-6`}>
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={tw`text-gray-500 mt-3 text-center`}>
              Student messaging will connect to real threads in a later release.
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
