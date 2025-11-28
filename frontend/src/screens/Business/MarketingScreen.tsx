import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../lib/tw';

type Campaign = {
  id: string;
  name: string;
  type: 'promotion' | 'sponsored' | 'influencer';
  status: 'active' | 'paused' | 'completed';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  startDate: string;
  endDate: string;
};

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: '1',
    name: 'Summer Fitness Sale',
    type: 'promotion',
    status: 'active',
    budget: 5000,
    spent: 3200,
    impressions: 45000,
    clicks: 1200,
    conversions: 45,
    startDate: '2024-01-01',
    endDate: '2024-01-31',
  },
  {
    id: '2',
    name: 'Instructor Partnership - Yoga',
    type: 'influencer',
    status: 'active',
    budget: 2000,
    spent: 850,
    impressions: 28000,
    clicks: 890,
    conversions: 23,
    startDate: '2024-01-10',
    endDate: '2024-02-10',
  },
];

type Post = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image: string;
  caption: string;
  category: string;
  likes: number;
  comments: number;
  timestamp: string;
  isInstructor: boolean;
};

const MOCK_POSTS: Post[] = [
  {
    id: '1',
    userId: 'u1',
    username: 'Sarah Johnson',
    avatar: '👩',
    image: '🏋️',
    caption: 'Day 15 of my fitness journey! Feeling stronger every day 💪',
    category: 'fitness',
    likes: 42,
    comments: 8,
    timestamp: '2h ago',
    isInstructor: true,
  },
  {
    id: '2',
    userId: 'u2',
    username: 'Mike Chen',
    avatar: '👨',
    image: '🎹',
    caption: 'Practiced piano for 2 hours today. Progress is slow but steady 🎵',
    category: 'art',
    likes: 28,
    comments: 5,
    timestamp: '4h ago',
    isInstructor: true,
  },
  {
    id: '3',
    userId: 'u3',
    username: 'Emma Davis',
    avatar: '👧',
    image: '🧘',
    caption: 'Morning meditation session complete. Starting the day with clarity ✨',
    category: 'mindset',
    likes: 35,
    comments: 12,
    timestamp: '6h ago',
    isInstructor: false,
  },
];

export default function MarketingScreen() {
  const [campaigns] = useState<Campaign[]>(MOCK_CAMPAIGNS);
  const [posts] = useState<Post[]>(MOCK_POSTS);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'posts' | 'create' | 'analytics'>('campaigns');

  const totalSpent = campaigns.reduce((sum, c) => sum + c.spent, 0);
  const totalBudget = campaigns.reduce((sum, c) => sum + c.budget, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const ctr = campaigns.reduce((sum, c) => sum + (c.clicks / c.impressions), 0) / campaigns.length * 100;

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
        <Text style={tw`text-2xl font-bold text-gray-900 mb-3`}>Marketing Center</Text>
        
        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={tw`-mx-4 px-4`}>
          <View style={tw`flex-row bg-gray-100 rounded-lg p-1`}>
            {(['campaigns', 'posts', 'create', 'analytics'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={tw`flex-1 py-2 rounded-md ${
                activeTab === tab ? 'bg-white shadow-sm' : ''
              }`}
            >
              <Text
                style={tw`text-center text-sm font-medium ${
                  activeTab === tab ? 'text-blue-600' : 'text-gray-600'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {activeTab === 'campaigns' && (
        <ScrollView style={tw`flex-1 px-4 pt-4`}>
          {/* Performance Overview */}
          <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100`}>
            <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Performance Overview</Text>
            <View style={tw`flex-row flex-wrap -mx-2`}>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Budget Spent</Text>
                <Text style={tw`text-xl font-bold text-gray-900`}>
                  ${totalSpent.toFixed(0)} / ${totalBudget.toFixed(0)}
                </Text>
                <View style={tw`h-2 bg-gray-200 rounded-full mt-2 overflow-hidden`}>
                  <View
                    style={[tw`h-full bg-blue-600 rounded-full`, { width: `${(totalSpent / totalBudget) * 100}%` }]}
                  />
                </View>
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Conversions</Text>
                <Text style={tw`text-xl font-bold text-green-600`}>{totalConversions}</Text>
                <Text style={tw`text-xs text-gray-500 mt-1`}>
                  ${(totalSpent / totalConversions).toFixed(2)} per conversion
                </Text>
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>CTR</Text>
                <Text style={tw`text-xl font-bold text-blue-600`}>{ctr.toFixed(2)}%</Text>
              </View>
              <View style={tw`w-1/2 px-2 mb-3`}>
                <Text style={tw`text-xs text-gray-500 mb-1`}>Active Campaigns</Text>
                <Text style={tw`text-xl font-bold text-gray-900`}>
                  {campaigns.filter(c => c.status === 'active').length}
                </Text>
              </View>
            </View>
          </View>

          {/* Campaigns List */}
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>Active Campaigns</Text>
          {campaigns.map((campaign) => (
            <View
              key={campaign.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-center justify-between mb-3`}>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-lg font-bold text-gray-900`}>{campaign.name}</Text>
                  <View style={tw`flex-row items-center mt-1`}>
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        campaign.type === 'promotion'
                          ? 'bg-blue-100'
                          : campaign.type === 'sponsored'
                          ? 'bg-purple-100'
                          : 'bg-orange-100'
                      } mr-2`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          campaign.type === 'promotion'
                            ? 'text-blue-700'
                            : campaign.type === 'sponsored'
                            ? 'text-purple-700'
                            : 'text-orange-700'
                        }`}
                      >
                        {campaign.type}
                      </Text>
                    </View>
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        campaign.status === 'active'
                          ? 'bg-green-100'
                          : campaign.status === 'paused'
                          ? 'bg-yellow-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          campaign.status === 'active'
                            ? 'text-green-700'
                            : campaign.status === 'paused'
                            ? 'text-yellow-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {campaign.status}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-sm text-gray-500`}>Budget</Text>
                  <Text style={tw`text-sm font-semibold text-gray-900`}>
                    ${campaign.spent.toFixed(0)} / ${campaign.budget.toFixed(0)}
                  </Text>
                </View>
                <View style={tw`h-2 bg-gray-200 rounded-full overflow-hidden mb-3`}>
                  <View
                    style={[tw`h-full bg-blue-600 rounded-full`, { width: `${(campaign.spent / campaign.budget) * 100}%` }]}
                  />
                </View>
                <View style={tw`flex-row flex-wrap -mx-2`}>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Impressions</Text>
                    <Text style={tw`text-sm font-bold text-gray-900`}>
                      {campaign.impressions.toLocaleString()}
                    </Text>
                  </View>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Clicks</Text>
                    <Text style={tw`text-sm font-bold text-gray-900`}>
                      {campaign.clicks.toLocaleString()}
                    </Text>
                  </View>
                  <View style={tw`w-1/3 px-2`}>
                    <Text style={tw`text-xs text-gray-500`}>Conversions</Text>
                    <Text style={tw`text-sm font-bold text-green-600`}>
                      {campaign.conversions}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={tw`bg-blue-600 rounded-xl py-4 flex-row items-center justify-center mb-4`}
          >
            <Ionicons name="add-circle" size={24} color="#FFFFFF" style={tw`mr-2`} />
            <Text style={tw`text-white font-bold text-base`}>Create New Campaign</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'posts' && (
        <ScrollView style={tw`flex-1 px-4 pt-4`}>
          <Text style={tw`text-lg font-bold text-gray-900 mb-3`}>
            Trending Posts & Instructors
          </Text>
          <Text style={tw`text-sm text-gray-600 mb-4`}>
            Engage with posts and connect with instructors for partnerships
          </Text>
          {posts.map((post) => (
            <View
              key={post.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-center mb-3`}>
                <View style={tw`w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                  <Text style={tw`text-xl`}>{post.avatar}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <View style={tw`flex-row items-center`}>
                    <Text style={tw`font-semibold text-gray-900`}>{post.username}</Text>
                    {post.isInstructor && (
                      <View style={tw`ml-2 px-2 py-0.5 bg-purple-100 rounded-full`}>
                        <Text style={tw`text-xs font-semibold text-purple-700`}>Instructor</Text>
                      </View>
                    )}
                  </View>
                  <Text style={tw`text-xs text-gray-500`}>{post.timestamp} • {post.category}</Text>
                </View>
              </View>
              <View style={tw`w-full h-64 bg-gray-100 rounded-xl items-center justify-center mb-3`}>
                <Text style={tw`text-6xl`}>{post.image}</Text>
              </View>
              <Text style={tw`text-gray-900 mb-3`}>{post.caption}</Text>
              <View style={tw`flex-row items-center justify-between`}>
                <View style={tw`flex-row items-center gap-4`}>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="heart" size={18} color="#EF4444" />
                    <Text style={tw`text-sm text-gray-600 ml-1`}>{post.likes}</Text>
                  </View>
                  <View style={tw`flex-row items-center`}>
                    <Ionicons name="chatbubble" size={18} color="#6B7280" />
                    <Text style={tw`text-sm text-gray-600 ml-1`}>{post.comments}</Text>
                  </View>
                </View>
                {post.isInstructor && (
                  <TouchableOpacity style={tw`px-4 py-2 bg-blue-600 rounded-lg`}>
                    <Text style={tw`text-white text-sm font-semibold`}>Partner</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'create' && (
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Ionicons name="megaphone-outline" size={64} color="#D1D5DB" />
          <Text style={tw`text-gray-500 mt-4 text-center text-lg`}>
            Campaign creation form coming soon
          </Text>
        </View>
      )}

      {activeTab === 'analytics' && (
        <View style={tw`flex-1 items-center justify-center p-6`}>
          <Ionicons name="analytics-outline" size={64} color="#D1D5DB" />
          <Text style={tw`text-gray-500 mt-4 text-center text-lg`}>
            Advanced analytics coming soon
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

