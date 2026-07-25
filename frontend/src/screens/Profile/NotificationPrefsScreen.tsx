import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw from '../../lib/tw';
import { featureFlags } from '../../constants/featureFlags';
import {
  fetchCurrentProfile,
  updateProfileOnServer,
  type NotificationPrefs,
} from '../../services/api/profile';

export default function NotificationPrefsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    notificationsEnabled: true,
    emailNotifications: true,
    pushNotifications: false,
    marketingEmails: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const profile = await fetchCurrentProfile();
        const stored = profile.notifications_prefs || {};
        setPrefs({
          notificationsEnabled: Boolean(stored.notificationsEnabled ?? true),
          emailNotifications: Boolean(stored.emailNotifications ?? true),
          pushNotifications: featureFlags.enablePushPrefs
            ? Boolean(stored.pushNotifications ?? false)
            : false,
          marketingEmails: Boolean(stored.marketingEmails ?? false),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not load preferences';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfileOnServer({
        metadata: { notifications_prefs: prefs },
      });
      if (Platform.OS === 'web') alert('Notification preferences saved');
      else Alert.alert('Saved', 'Your notification preferences have been updated');
      navigation.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save preferences';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={tw`text-lg font-semibold text-stone-900`}>Notifications</Text>
        <View style={tw`w-6`} />
      </View>

      {loading ? (
        <View style={tw`flex-1 items-center justify-center`}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      ) : (
        <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
          <View style={tw`bg-white rounded-xl overflow-hidden mb-4`}>
            <PrefRow
              title="Enable notifications"
              description="Master switch for all app notifications"
              value={!!prefs.notificationsEnabled}
              onToggle={() => toggle('notificationsEnabled')}
            />
            <PrefRow
              title="Email notifications"
              description="Order updates, mentions, and account alerts"
              value={!!prefs.emailNotifications}
              onToggle={() => toggle('emailNotifications')}
              disabled={!prefs.notificationsEnabled}
            />
            {featureFlags.enablePushPrefs ? (
              <PrefRow
                title="Push notifications"
                description="Real-time alerts on your device"
                value={!!prefs.pushNotifications}
                onToggle={() => toggle('pushNotifications')}
                disabled={!prefs.notificationsEnabled}
              />
            ) : (
              <View style={tw`px-4 py-4 border-b border-stone-100`}>
                <Text style={tw`text-stone-900 font-medium`}>Push notifications</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>
                  Coming soon — device push is not enabled in this build. Email alerts still work.
                </Text>
              </View>
            )}
            <PrefRow
              title="Marketing emails"
              description="Product news and growth tips"
              value={!!prefs.marketingEmails}
              onToggle={() => toggle('marketingEmails')}
              disabled={!prefs.notificationsEnabled}
              last
            />
          </View>

          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={saving}
            style={tw`bg-brand-600 rounded-xl py-4 items-center ${saving ? 'opacity-60' : ''}`}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={tw`text-white font-bold text-base`}>Save Preferences</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PrefRow({
  title,
  description,
  value,
  onToggle,
  disabled,
  last,
}: {
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={tw`flex-row items-center justify-between px-4 py-4 ${
        last ? '' : 'border-b border-stone-100'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <View style={tw`flex-1 pr-3`}>
        <Text style={tw`text-stone-900 font-medium`}>{title}</Text>
        <Text style={tw`text-xs text-stone-500 mt-0.5`}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#D6D3D1', true: '#A7F3D0' }}
        thumbColor={value ? '#059669' : '#F5F5F4'}
      />
    </View>
  );
}
