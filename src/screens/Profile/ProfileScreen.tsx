import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

type Award = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
};

const AWARDS: Award[] = [
  {
    id: '1',
    name: 'First Steps',
    description: 'Complete your first post',
    icon: '🎯',
    unlocked: true,
    unlockedAt: '2024-01-10',
  },
  {
    id: '2',
    name: 'Week Warrior',
    description: 'Post for 7 consecutive days',
    icon: '🔥',
    unlocked: true,
    unlockedAt: '2024-01-15',
  },
  {
    id: '3',
    name: 'Community Helper',
    description: 'Help 10 other users',
    icon: '🤝',
    unlocked: false,
  },
  {
    id: '4',
    name: 'Instructor Ready',
    description: 'Reach 500 points',
    icon: '🎓',
    unlocked: false,
  },
];

export default function ProfileScreen() {
  const { user, signOut } = useAuthStore();
  const points = user?.points || 0;
  const isInstructor = user?.isInstructor || false;

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <ScrollView style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`px-4 pt-4 pb-6 border-b border-gray-200`}>
          <View style={tw`flex-row items-center mb-4`}>
            <View style={tw`w-20 h-20 rounded-full bg-green-100 items-center justify-center mr-4`}>
              <Text style={tw`text-4xl`}>👤</Text>
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-2xl font-bold text-gray-900`}>
                {user?.email?.split('@')[0] || 'User'}
              </Text>
              {isInstructor && (
                <View style={tw`flex-row items-center mt-1`}>
                  <Ionicons name="school" size={16} color="#10B981" />
                  <Text style={tw`text-sm text-green-600 ml-1 font-semibold`}>Instructor</Text>
                </View>
              )}
            </View>
          </View>

          {/* Points Display */}
          <View style={tw`bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4`}>
            <View style={tw`flex-row items-center justify-between`}>
              <View>
                <Text style={tw`text-white text-sm mb-1`}>Total Points</Text>
                <Text style={tw`text-white text-3xl font-bold`}>{points}</Text>
              </View>
              <Ionicons name="trophy" size={40} color="white" />
            </View>
            {!isInstructor && (
              <View style={tw`mt-3 pt-3 border-t border-green-400`}>
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-white text-sm`}>Points to Instructor: {500 - points}</Text>
                  <View style={tw`flex-1 h-2 bg-green-400 rounded-full mx-3 overflow-hidden`}>
                    <View
                      style={[tw`h-full bg-white rounded-full`, { width: `${Math.min((points / 500) * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Categories */}
        {user?.categories && user.categories.length > 0 && (
          <View style={tw`px-4 py-4 border-b border-gray-200`}>
            <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Your Growth Areas</Text>
            <View style={tw`flex-row flex-wrap`}>
              {user.categories.map((cat, index) => (
                <View
                  key={index}
                  style={tw`bg-green-100 px-3 py-1.5 rounded-full mr-2 mb-2`}
                >
                  <Text style={tw`text-sm text-green-800 font-medium`}>{cat}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Awards Section */}
        <View style={tw`px-4 py-4 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Awards & Achievements</Text>
          <View style={tw`flex-row flex-wrap`}>
            {AWARDS.map((award) => (
              <View
                key={award.id}
                style={tw`w-1/2 mb-4 pr-2`}
              >
                <View
                  style={tw`bg-white border-2 rounded-xl p-4 items-center ${
                    award.unlocked
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <Text style={tw`text-4xl mb-2`}>{award.icon}</Text>
                  <Text
                    style={tw`font-semibold text-center mb-1 ${
                      award.unlocked ? 'text-gray-900' : 'text-gray-500'
                    }`}
                  >
                    {award.name}
                  </Text>
                  <Text
                    style={tw`text-xs text-center ${
                      award.unlocked ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    {award.description}
                  </Text>
                  {award.unlocked && award.unlockedAt && (
                    <Text style={tw`text-xs text-green-600 mt-1`}>
                      Unlocked {new Date(award.unlockedAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={tw`px-4 py-4`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Settings</Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="person-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="notifications-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Help & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignOut}
            style={tw`flex-row items-center justify-between py-3 mt-2`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
              <Text style={tw`text-red-600 ml-3 font-semibold`}>Sign Out</Text>
            </View>
          </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

