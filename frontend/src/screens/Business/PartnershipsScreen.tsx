import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { navigateFromRoot } from '../../app/navigation/rootNavigation';
import {
  getPartnerships,
  getPartnershipDiscover,
  createPartnershipRequest,
  updatePartnershipRequest,
  type PartnershipRecord,
  type PartnershipRequestRecord,
  type DiscoverInstructor,
} from '../../services/api/business';

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
  const [partners, setPartners] = useState<PartnershipRecord[]>([]);
  const [available, setAvailable] = useState<DiscoverInstructor[]>([]);
  const [requests, setRequests] = useState<PartnershipRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const load = useCallback(async (pull = false) => {
    try {
      if (!pull) setLoading(true);
      const [partnershipsRes, discoverRes] = await Promise.all([getPartnerships(), getPartnershipDiscover()]);
      if (partnershipsRes.success && partnershipsRes.data) {
        setPartners(partnershipsRes.data.partnerships || []);
        setRequests(partnershipsRes.data.requests || []);
      }
      if (discoverRes.success && discoverRes.data) {
        setAvailable(discoverRes.data.instructors || []);
      }
    } catch (e: unknown) {
      notify('Error', e instanceof Error ? e.message : 'Could not load partnerships');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const openInstructorProfile = (instructorId: string) => {
    navigateFromRoot(navigation, 'PublicProfile', { userId: instructorId });
  };

  const managePartner = (instructorName: string) => {
    notify(
      'Partnership',
      `Advanced contract and payout tools for ${instructorName} are next in the roadmap.`
    );
  };

  const sendPartnershipRequest = async (instructor: DiscoverInstructor) => {
    if (busyRequestId) return;
    try {
      setBusyRequestId(instructor.id);
      await createPartnershipRequest({
        instructorId: instructor.id,
        partnershipType: 'commission',
        commissionRate: 12,
      });
      notify('Request sent', `Partnership request sent to ${instructor.username}.`);
      await load(true);
    } catch (e: unknown) {
      notify('Error', e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setBusyRequestId(null);
    }
  };

  const setRequestStatus = async (requestId: string, status: 'approved' | 'declined') => {
    if (busyRequestId) return;
    try {
      setBusyRequestId(requestId);
      await updatePartnershipRequest(requestId, status);
      notify(status === 'approved' ? 'Approved' : 'Declined', `Request ${status}.`);
      await load(true);
    } catch (e: unknown) {
      notify('Error', e instanceof Error ? e.message : 'Could not update request');
    } finally {
      setBusyRequestId(null);
    }
  };

  const totalPartners = partners.length;
  const activePartners = partners.filter((p) => p.status === 'active').length;
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;
  const categoriesPreview = (categories?: string[]) =>
    categories && categories.length ? categories.slice(0, 2).join(', ') : 'General';

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
              <Text style={tw`text-xs text-purple-600 mb-1`}>Pending</Text>
            <Text style={tw`text-xl font-bold text-purple-900`}>
                {pendingRequests}
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
        <ScrollView
          style={tw`flex-1 px-4 pt-4`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        >
          {loading ? <ActivityIndicator style={tw`mt-6 mb-4`} color="#2563EB" /> : null}
          {requests.length > 0 ? (
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Request queue</Text>
              {requests.map((request) => (
                <View key={request.id} style={tw`bg-white rounded-xl p-3 mb-2 border border-gray-100`}>
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={tw`font-semibold text-gray-900`}>{request.instructor_name}</Text>
                    <Text style={tw`text-xs text-gray-500`}>{new Date(request.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={tw`text-xs text-gray-500 mt-1 mb-2`}>
                    {categoriesPreview(request.categories)}
                  </Text>
                  {request.status === 'pending' ? (
                    <View style={tw`flex-row`}>
                      <TouchableOpacity
                        style={tw`px-3 py-1.5 bg-emerald-100 rounded-lg mr-2`}
                        disabled={busyRequestId === request.id}
                        onPress={() => void setRequestStatus(request.id, 'approved')}
                      >
                        <Text style={tw`text-xs font-semibold text-emerald-800`}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={tw`px-3 py-1.5 bg-red-100 rounded-lg`}
                        disabled={busyRequestId === request.id}
                        onPress={() => void setRequestStatus(request.id, 'declined')}
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
                  <Text style={tw`text-3xl`}>{instructor.instructor_avatar || '👤'}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <View style={tw`flex-row items-center justify-between mb-1`}>
                    <Text style={tw`text-lg font-bold text-gray-900`}>{instructor.instructor_name}</Text>
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
                  <Text style={tw`text-sm text-gray-500 mb-2`}>{categoriesPreview(instructor.categories)}</Text>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-2`}>
                  <Text style={tw`text-sm text-gray-500`}>Partnership Type</Text>
                  <Text style={tw`text-sm font-semibold text-gray-900 capitalize`}>
                    {instructor.partnership_type}
                  </Text>
                </View>
                {instructor.partnership_type === 'commission' || instructor.partnership_type === 'hybrid' ? (
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text style={tw`text-sm text-gray-500`}>Commission Rate</Text>
                    <Text style={tw`text-sm font-semibold text-blue-600`}>
                      {instructor.commission_rate ?? 0}%
                    </Text>
                  </View>
                ) : null}
                <View style={tw`flex-row items-center justify-between`}>
                  <Text style={tw`text-sm text-gray-500`}>
                    {instructor.partnership_type === 'fixed' ? 'Fixed Fee' : 'Base Fee'}
                  </Text>
                  <Text style={tw`text-sm font-bold text-gray-900`}>${instructor.fixed_fee ?? 0}</Text>
                </View>
              </View>

              <View style={tw`flex-row gap-2 mt-3`}>
                <TouchableOpacity
                  style={tw`flex-1 bg-blue-600 rounded-lg py-2`}
                  onPress={() => managePartner(instructor.instructor_name)}
                >
                  <Text style={tw`text-white text-center font-semibold text-sm`}>Manage</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-1 bg-gray-200 rounded-lg py-2`}
                  onPress={() => openInstructorProfile(instructor.instructor_id)}
                >
                  <Text style={tw`text-gray-700 text-center font-semibold text-sm`}>View Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {activeTab === 'discover' && (
        <ScrollView
          style={tw`flex-1 px-4 pt-4`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}
        >
          <Text style={tw`text-sm text-gray-500 mb-3`}>
            Discover instructors who align with your brand
          </Text>
          {loading ? <ActivityIndicator style={tw`mt-6 mb-4`} color="#2563EB" /> : null}
          {available.map((instructor) => (
            <View
              key={instructor.id}
              style={tw`bg-white rounded-xl p-4 mb-3 shadow-sm border border-gray-100`}
            >
              <View style={tw`flex-row items-start mb-3`}>
                <View style={tw`w-14 h-14 rounded-full bg-gray-100 items-center justify-center mr-3`}>
                  <Text style={tw`text-3xl`}>{instructor.avatar || '👤'}</Text>
                </View>
                <View style={tw`flex-1`}>
                  <Text style={tw`text-lg font-bold text-gray-900 mb-1`}>{instructor.username}</Text>
                  <Text style={tw`text-sm text-gray-500 mb-2`}>{categoriesPreview(instructor.categories)}</Text>
                  <View style={tw`flex-row items-center gap-4`}>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="people" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.vote_count.toLocaleString()} votes
                      </Text>
                    </View>
                    <View style={tw`flex-row items-center`}>
                      <Ionicons name="trending-up" size={14} color="#6B7280" />
                      <Text style={tw`text-xs text-gray-500 ml-1`}>
                        {instructor.points} pts
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={tw`border-t border-gray-100 pt-3`}>
                <View style={tw`flex-row items-center justify-between mb-3`}>
                  <View>
                    <Text style={tw`text-sm text-gray-500`}>Proposed Fee</Text>
                    <Text style={tw`text-lg font-bold text-gray-900`}>Commission</Text>
                  </View>
                  {true && (
                    <View>
                      <Text style={tw`text-sm text-gray-500`}>Commission</Text>
                      <Text style={tw`text-lg font-bold text-blue-600`}>
                        12%
                      </Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    tw`rounded-lg py-3`,
                    requests.some((request) => request.instructor_id === instructor.id && request.status === 'pending')
                      ? tw`bg-gray-400`
                      : tw`bg-green-600`,
                  ]}
                  disabled={
                    requests.some((request) => request.instructor_id === instructor.id && request.status === 'pending') ||
                    !!busyRequestId
                  }
                  onPress={() => void sendPartnershipRequest(instructor)}
                >
                  <Text style={tw`text-white text-center font-bold`}>
                    {requests.some((request) => request.instructor_id === instructor.id && request.status === 'pending')
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

