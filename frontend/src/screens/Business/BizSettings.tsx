import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Switch, Platform, TextInput, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../store/hooks';
import tw from '../../lib/tw';
import { resetNavigationToAuth, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { SUPPORT_EMAIL } from '../../content/legal';
import { getBusinessSettings, updateBusinessSettings } from '../../services/api/business';

export default function BizSettings() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [businessName, setBusinessName] = React.useState('');
  const [logoUrl, setLogoUrl] = React.useState('');
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [emailNotifications, setEmailNotifications] = React.useState(true);
  const [pushNotifications, setPushNotifications] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getBusinessSettings();
        if (res.success && res.data) {
          setBusinessName(res.data.business_name || '');
          setLogoUrl(res.data.logo_url || '');
          const notif = res.data.notifications_prefs || {};
          setNotificationsEnabled(Boolean((notif as any).notificationsEnabled ?? true));
          setEmailNotifications(Boolean((notif as any).emailNotifications ?? true));
          setPushNotifications(Boolean((notif as any).pushNotifications ?? true));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not load settings';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const saveSettings = async () => {
    try {
      setSaving(true);
      await updateBusinessSettings({
        business_name: businessName.trim() || undefined,
        logo_url: logoUrl.trim() || undefined,
        notifications_prefs: {
          notificationsEnabled,
          emailNotifications,
          pushNotifications,
        },
      });
      if (Platform.OS === 'web') alert('Settings saved');
      else Alert.alert('Saved', 'Business settings updated');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save settings';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const performSignOut = async () => {
    await signOut();
    resetNavigationToAuth(navigation);
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm('Are you sure you want to sign out?');
      if (ok) void performSignOut();
      return;
    }
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => void performSignOut(),
      },
    ]);
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView style={tw`flex-1`}>
        {loading ? (
          <View style={tw`items-center justify-center py-8`}>
            <ActivityIndicator size="large" color="#059669" />
          </View>
        ) : null}
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
            <TextInput
              value={businessName}
              onChangeText={setBusinessName}
              style={tw`text-gray-700 min-w-[150px] text-right`}
              placeholder="My Business"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={tw`py-3 border-b border-gray-100`}>
            <Text style={tw`text-gray-900 mb-2`}>Logo URL</Text>
            <TextInput
              value={logoUrl}
              onChangeText={setLogoUrl}
              style={tw`bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700`}
              placeholder="https://..."
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <TouchableOpacity style={tw`flex-row items-center justify-between py-3`}>
            <View style={tw`flex-row items-center`}>
              <Ionicons name="mail" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Email</Text>
            </View>
            <Text style={tw`text-gray-600`}>{user?.email}</Text>
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
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}
            onPress={() => (navigation as any).navigate('Partnerships')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="people-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Partnership Settings</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3`}
            onPress={() => (navigation as any).getParent()?.navigate('BusinessAnalytics')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="analytics-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Analytics</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Support */}
        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-gray-200`}>
          <Text style={tw`text-lg font-semibold text-gray-900 mb-3`}>Support</Text>
          <TouchableOpacity
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="chatbubbles-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Contact Support</Text>
            </View>
            <Text style={tw`text-xs text-stone-500`}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigateFromRoot(navigation, 'Legal')}
            style={tw`flex-row items-center justify-between py-3 border-b border-gray-100`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="document-text-outline" size={20} color="#6B7280" />
              <Text style={tw`text-gray-900 ml-3`}>Terms & Policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigateFromRoot(navigation, 'DeleteAccount')}
            style={tw`flex-row items-center justify-between py-3`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <Text style={tw`text-red-700 ml-3 font-semibold`}>Delete account</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DC2626" />
          </TouchableOpacity>
        </View>

        <View style={tw`px-4 pb-2`}>
          <TouchableOpacity
            onPress={() => void saveSettings()}
            disabled={saving}
            style={tw`bg-emerald-600 rounded-xl py-3 items-center ${saving ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-semibold`}>{saving ? 'Saving...' : 'Save Settings'}</Text>
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
