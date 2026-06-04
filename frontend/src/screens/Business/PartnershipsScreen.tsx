import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';

type Instructor = {
  id: string;
  name: string;
  avatar: string;
  category: string;
  followers: number;
  engagementRate: number;
  fee: number;
  status: 'active' | 'pending' | 'inactive';
  partnershipType: 'commission' | 'fixed' | 'hybrid';
  commissionRate?: number;
};

type PartnershipRequest = {
  id: string;
  instructor: Instructor;
  createdAt: string;
  status: 'pending' | 'approved' | 'declined';
};

const MOCK_INSTRUCTORS: Instructor[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    avatar: '👩',
    category: 'Fitness - Yoga',
    followers: 12500,
    engagementRate: 4.2,
    fee: 500,
    status: 'active',
    partnershipType: 'commission',
    commissionRate: 15,
  },
  {
    id: '2',
    name: 'Mike Chen',
    avatar: '👨',
    category: 'Nutrition',
    followers: 8900,
    engagementRate: 5.8,
    fee: 300,
    status: 'active',
    partnershipType: 'hybrid',
    commissionRate: 10,
  },
  {
    id: '3',
    name: 'Emma Davis',
    avatar: '👧',
    category: 'Mindset - Meditation',
    followers: 15200,
    engagementRate: 3.9,
    fee: 750,
    status: 'pending',
    partnershipType: 'fixed',
  },
];

const AVAILABLE_INSTRUCTORS: Instructor[] = [
  {
    id: '4',
    name: 'Alex Thompson',
    avatar: '🧑',
    category: 'Fitness - Strength',
    followers: 21000,
    engagementRate: 6.1,
    fee: 1000,
    status: 'inactive',
    partnershipType: 'commission',
    commissionRate: 20,
  },
];

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export default function PartnershipsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState<'partners' | 'discover'>('partners');
  const [partners, setPartners] = useState<Instructor[]>(MOCK_INSTRUCTORS);
  const [available, setAvailable] = useState<Instructor[]>(AVAILABLE_INSTRUCTORS);
  const [requests, setRequests] = useState<PartnershipRequest[]>([]);

  const openInstructorProfile = (instructor: Instructor) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId: instructor.id });
  };

  const managePartner = (instructor: Instructor) => {
    notify(
      'Partnership',
      `Open partnership tools for ${instructor.name}. Contract and payout flows can plug in here.`
    );
  };

  const sendPartnershipRequest = (instructor: Instructor) => {
    setRequests((prev) => [
      {
        id: `req-${Date.now()}-${instructor.id}`,
        instructor,
        createdAt: new Date().toISOString(),
        status: 'pending',
      },
      ...prev,
    ]);
    setAvailable((prev) => prev.filter((candidate) => candidate.id !== instructor.id));
    notify(
      'Request sent',
      `We notified ${instructor.name} about your partnership proposal. They can accept from their instructor inbox.`
    );
  };

  const updateRequestStatus = (requestId: string, status: 'approved' | 'declined') => {
    let targetInstructor: Instructor | null = null;
    setRequests((prev) =>
      prev.map((request) => {
        if (request.id === requestId) {
          targetInstructor = request.instructor;
          return { ...request, status };
        }
        return request;
      })
    );
    if (status === 'approved' && targetInstructor) {
      setPartners((prev) => [{ ...targetInstructor, status: 'active' }, ...prev]);
      notify('Partnership approved', `${targetInstructor.name} is now an active partner.`);
    } else if (status === 'declined' && targetInstructor) {
      setAvailable((prev) => [targetInstructor, ...prev]);
      notify('Request declined', `${targetInstructor.name} stayed in your discover list.`);
    }
  };

  const totalPartners = partners.length;
  const activePartners = partners.filter(p => p.status === 'active').length;
  const totalRevenue = partners
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.followers * p.engagementRate / 100), 0);

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      {/* Header */}
      <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
        <Text style={tw`text-2xl font-bold text-gray-900 mb-3`}>Instructor Partnerships</Text>
        
        {/* Stats */}
        <View style={tw`flex-row gap-3 mb-3`}>
          <View style={tw`flex-1 bg-blue-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-blue-600 mb-1`}>Active Partners</Text>
            <Text style={tw`text-xl font-bold text-blue-900`}>{activePartners}</Text>
          </View>
          <View style={tw`flex-1 bg-green-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-green-600 mb-1`}>Total Partners</Text>
            <Text style={tw`text-xl font-bold text-green-900`}>{totalPartners}</Text>
          </View>
          <View style={tw`flex-1 bg-purple-50 rounded-lg p-3`}>
            <Text style={tw`text-xs text-purple-600 mb-1`}>Est. Reach</Text>
            <Text style={tw`text-xl font-bold text-purple-900`}>
              {totalRevenue.toFixed(0)}K
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={tw`flex-row bg-gray-100 rounded-lg p-1`}>
          <TouchableOpacity
            onPress={() => setActiveTab('partners')}
            style={tw`flex-1 py-2 rounded-md ${
              activeTab === 'partners' ? 'bg-white shadow-sm' : ''
            }`}
          >
            <Text
              style={tw`text-center text-sm font-medium ${
                activeTab === 'partners' ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              My Partners
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('discover')}
            style={tw`flex-1 py-2 rounded-md ${
              activeTab === 'discover' ? 'bg-white shadow-sm' : ''
            }`}
          >
            <Text
              style={tw`text-center text-sm font-medium ${
                activeTab === 'discover' ? 'text-blue-600' : 'text-gray-600'
              }`}
            >
              Discover
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'partners' && (
        <ScrollView style={tw`flex-1 px-4 pt-4`}>
          {requests.length > 0 ? (
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Request queue</Text>
              {requests.map((request) => (
                <View key={request.id} style={tw`bg-white rounded-xl p-3 mb-2 border border-gray-100`}>
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw`font-semibold text-gray-900`}>{request.instructor.name}</Text>
                    <Text style={tw`text-xs text-gray-500`}>{new Date(request.createdAt).toLocaleDateString()}</Text>
                  </View>
                  <Text style={tw`text-xs text-gray-500 mt-1 mb-2`}>{request.instructor.category}</Text>
                  {request.status === 'pending' ? (
                    <View style={tw`flex-row`}>
                      <TouchableOpacity
                        style={tw`px-3 py-1.5 bg-emerald-100 rounded-lg mr-2`}
                        onPress={() => updateRequestStatus(request.id, 'approved')}
                      >
                        <Text style={tw`text-xs font-semibold text-emerald-800`}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={tw`px-3 py-1.5 bg-red-100 rounded-lg`}
                        onPress={() => updateRequestStatus(request.id, 'declined')}
                      >
                        <Text style={tw`text-xs font-semibold text-red-800`}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text
                      style={tw`text-xs font-semibold ${
                        request.status === 'approved' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {request.status === 'approved' ? 'Approved' : 'Declined'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}

          {partners.map((instructor) => (
            <View
              key={instructor.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-start mb-3`}>
                <View style={tw`w-14 h-14 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                  <Text style={tw`text-3xl`}>{instructor.avatar}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <View style={tw`flex-row items-center justify-between mb-1`}>
                    <Text style={tw`text-lg font-bold text-gray-900`}>{instructor.name}</Text>
                    <View
                      style={tw`px-2 py-1 rounded-full ${
                        instructor.status === 'active'
                          ? 'bg-green-100'
                          : instructor.status === 'pending'
                          ? 'bg-yellow-100'
                          : 'bg-gray-100'
                      }`}
                    >
                      <Text
                        style={tw`text-xs font-semibold ${
                          instructor.status === 'active'
                            ? 'text-green-700'
                            : instructor.status === 'pending'
                            ? 'text-yellow-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {instructor.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={tw`text-sm text-gray-500 mb-2`}>{instructor.category}</Text>
                  <View style={tw`flex-row items-center gap-4`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="people" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.followers.toLocaleString()}
                      </Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="trending-up" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.engagementRate}% engagement
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-sm text-gray-500`}>Partnership Type</Text>
                  <Text style={tw`text-sm font-semibold text-gray-900 capitalize`}>
                    {instructor.partnershipType}
                  </Text>
                </View>
                {instructor.partnershipType === 'commission' || instructor.partnershipType === 'hybrid' ? (
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm text-gray-500`}>Commission Rate</Text>
                    <Text style={tw`text-sm font-semibold text-blue-600`}>
                      {instructor.commissionRate}%
                    </Text>
                  </View>
                ) : null}
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-sm text-gray-500`}>
                    {instructor.partnershipType === 'fixed' ? 'Fixed Fee' : 'Base Fee'}
                  </Text>
                  <Text style={tw`text-sm font-bold text-gray-900`}>${instructor.fee}</Text>
                </View>
              </View>

              <View style={tw`flex-row gap-2 mt-3`}>
                <TouchableOpacity
                  style={tw`flex-1 bg-blue-600 rounded-lg py-2`}
                  onPress={() => managePartner(instructor)}
                >
                  <Text style={tw`text-white text-center font-semibold text-sm`}>Manage</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-1 bg-gray-200 rounded-lg py-2`}
                  onPress={() => openInstructorProfile(instructor)}
                >
                  <Text style={tw`text-gray-700 text-center font-semibold text-sm`}>View Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'discover' && (
        <ScrollView style={tw`flex-1 px-4 pt-4`}>
          <Text style={tw`text-sm text-gray-500 mb-3`}>
            Discover instructors who align with your brand
          </Text>
          {available.map((instructor) => (
            <View
              key={instructor.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-start mb-3`}>
                <View style={tw`w-14 h-14 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                  <Text style={tw`text-3xl`}>{instructor.avatar}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-lg font-bold text-gray-900 mb-1`}>{instructor.name}</Text>
                  <Text style={tw`text-sm text-gray-500 mb-2`}>{instructor.category}</Text>
                  <View style={tw`flex-row items-center gap-4`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="people" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.followers.toLocaleString()}
                      </Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="trending-up" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.engagementRate}% engagement
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View>
                    <Text style={tw`text-sm text-gray-500`}>Proposed Fee</Text>
                    <Text style={tw`text-lg font-bold text-gray-900`}>${instructor.fee}</Text>
                  </View>
                  {instructor.commissionRate && (
                    <View>
                      <Text style={tw`text-sm text-gray-500`}>Commission</Text>
                      <Text style={tw`text-lg font-bold text-blue-600`}>
                        {instructor.commissionRate}%
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    tw`rounded-lg py-3`,
                    requests.some((request) => request.instructor.id === instructor.id && request.status === 'pending')
                      ? tw`bg-gray-400`
                      : tw`bg-green-600`,
                  ]}
                  disabled={requests.some((request) => request.instructor.id === instructor.id && request.status === 'pending')}
                  onPress={() => sendPartnershipRequest(instructor)}
                >
                  <Text style={tw`text-white text-center font-bold`}>
                    {requests.some((request) => request.instructor.id === instructor.id && request.status === 'pending')
                      ? 'Request sent'
                      : 'Send Partnership Request'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

