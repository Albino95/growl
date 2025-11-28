import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CommonActions } from '@react-navigation/native';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

export default function BizSettings() {
  const { user, signOut } = useAuthStore();
  const navigation = useNavigation();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [emailNotifications, setEmailNotifications] = React.useState(true);
  const [pushNotifications, setPushNotifications] = React.useState(true);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'Auth' as never }],
              })
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-gray-200`}>
          <Text style={tw`text-2xl font-bold text-gray-900`}>Business Settings</Text>
          <Text style={tw`text-sm text-gray-500 mt-1`}>Manage your business account</Text>
        </View>

        {/* Business Info */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Business Information</Text>
          <View style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="business" size={20} color="#3B82F6" />
              <Text style={tw`text-gray-900 ml-3`}>Business Name</Text>
            </View>
            <Text style={tw`text-gray-600`}>{user?.email?.split('@')[0] || 'My Business'}</Text>
          </View>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="mail" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Email</Text>
            </View>
            <Text style={tw`text-gray-600`}>{user?.email}</Text>
          </TouchableOpacity>
        </View>

        {/* Account Settings */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Account Settings</Text>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="person-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Edit Profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="lock-closed-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Change Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="card-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Payment Methods</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Notifications</Text>
          <View style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="notifications-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Push Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="mail-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Email Notifications</Text>
            </View>
            <Switch
              value={emailNotifications}
              onValueChange={setEmailNotifications}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="megaphone-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Marketing Updates</Text>
            </View>
            <Switch
              value={pushNotifications}
              onValueChange={setPushNotifications}
              trackColor={{ false: '#D1D5DB', true: '#3B82F6' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Business Preferences */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Business Preferences</Text>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="people-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Partnership Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="analytics-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Analytics Preferences</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="receipt-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Tax Information</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Support</Text>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="help-circle-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="chatbubbles-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="document-text-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Terms & Policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <View style={tw`px-4 py-4 mb-6`}>
          <TouchableOpacity
            onPress={handleSignOut}
            style={tw`bg-red-50 border border-red-200 rounded-xl py-4 flex-row items-center justify-center`}
          >
            <Ionicons name="log-out-outline" size={20} color="#EF4444" style={tw`mr-2`} />
            <Text style={tw`text-red-600 font-bold text-base`}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
