import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator, Platform } from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import { alertMessage } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { toggleFeedback } from '../../theme/haptics';
import DailyReminderSection from '../../components/reminders/DailyReminderSection';
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
        else void alertMessage('Error', msg);
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
      toast.success('Notifications saved');
      navigation.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save preferences';
      if (Platform.OS === 'web') alert(msg);
      else void alertMessage('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-page`}>
      <View
        style={tw`flex-row items-center justify-between px-gutter py-3 bg-card border-b border-line`}
      >
        <PressableScale
          onPress={() => navigation.goBack()}
          pressedScale={0.9}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.ink} />
        </PressableScale>
        <Text style={tw`text-lg font-semibold text-ink`}>Notifications</Text>
        <View style={tw`w-6`} />
      </View>

      <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
        {/* Device-local, applies instantly — independent of the account prefs below. */}
        <DailyReminderSection />

        {loading ? (
          <View style={tw`py-10 items-center`}>
            <ActivityIndicator color={theme.colors.brand} />
            <Text style={tw`text-xs text-ink-3 mt-2`}>Loading preferences…</Text>
          </View>
        ) : (
          <>
            <Text
              style={tw`text-caption font-semibold text-ink-3 uppercase tracking-wider mb-2 px-1`}
            >
              Account
            </Text>
            <View style={tw`bg-card rounded-control overflow-hidden mb-4`}>
              <PrefRow
                title="Enable notifications"
                description="Master switch for email and account alerts"
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
              ) : null}
              <PrefRow
                title="Marketing emails"
                description="Product news and growth tips"
                value={!!prefs.marketingEmails}
                onToggle={() => toggle('marketingEmails')}
                disabled={!prefs.notificationsEnabled}
                last
              />
            </View>

            <PressableScale
              onPress={() => void handleSave()}
              disabled={saving}
              style={tw`bg-brand-600 rounded-control py-4 items-center ${saving ? 'opacity-60' : ''}`}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={tw`text-white font-bold text-base`}>Save Preferences</Text>
              )}
            </PressableScale>
          </>
        )}
      </ScrollView>
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
        last ? '' : 'border-b border-line'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <View style={tw`flex-1 pr-3`}>
        <Text style={tw`text-ink font-medium`}>{title}</Text>
        <Text style={tw`text-xs text-ink-3 mt-0.5`}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          toggleFeedback(v);
          onToggle();
        }}
        disabled={disabled}
        trackColor={{ false: tw.color('stone-300'), true: tw.color('emerald-200') }}
        thumbColor={value ? '#059669' : '#F5F5F4'}
      />
    </View>
  );
}
