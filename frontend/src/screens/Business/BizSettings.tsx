import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useAppDispatch, useAppSelector } from '../../store/hooks';
import tw from '../../lib/tw';
import { resetNavigationToAuth, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { SUPPORT_EMAIL } from '../../content/legal';
import { updateBusinessSettings } from '../../services/api/business';
import { fetchBusinessSettings } from '../../store/slices/businessSlice';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { verticalScrollProps } from '../../constants/scroll';

const EMERALD = '#059669';

export default function BizSettings() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const savedSettings = useAppSelector((s) => s.business.settings);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [defaultShippingNote, setDefaultShippingNote] = useState('');

  const applySettings = useCallback((data: NonNullable<typeof savedSettings>) => {
    setBusinessName(data.business_name || '');
    setLogoUrl(data.logo_url || '');
    const notif = (data.notifications_prefs || {}) as Record<string, unknown>;
    setNotificationsEnabled(Boolean(notif.notificationsEnabled ?? true));
    setEmailNotifications(Boolean(notif.emailNotifications ?? true));
    setPushNotifications(Boolean(notif.pushNotifications ?? true));
    const analytics = (data.analytics_prefs || {}) as Record<string, unknown>;
    setLowStockThreshold(String(analytics.low_stock_threshold ?? 10));
    setDefaultShippingNote(String(analytics.default_shipping_note ?? ''));
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (savedSettings) {
          applySettings(savedSettings);
          setLoading(false);
          return;
        }
        const result = await dispatch(fetchBusinessSettings()).unwrap();
        applySettings(result);
      } catch (e: unknown) {
        alertMessage('Error', e instanceof Error ? e.message : 'Could not load settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [dispatch, savedSettings, applySettings]);

  const saveSettings = async () => {
    const threshold = Number(lowStockThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      alertMessage('Invalid threshold', 'Low stock threshold must be a non-negative number.');
      return;
    }
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
        analytics_prefs: {
          low_stock_threshold: threshold,
          default_shipping_note: defaultShippingNote.trim(),
        },
      });
      await dispatch(fetchBusinessSettings()).unwrap();
      alertMessage('Saved', 'Business settings updated.');
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const performSignOut = async () => {
    await signOut();
    resetNavigationToAuth(navigation);
  };

  const handleSignOut = async () => {
    const ok = await confirmAsync('Sign Out', 'Are you sure you want to sign out?', {
      confirmLabel: 'Sign Out',
      destructive: true,
    });
    if (ok) void performSignOut();
  };

  const openStorefrontPreview = () => {
    alertMessage('Storefront', 'Marketplace shows your products to shoppers.');
  };

  const stackNav = navigation.getParent?.() || navigation;

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['bottom']}>
      <ScrollView style={tw`flex-1`} {...verticalScrollProps}>
        {loading ? (
          <View style={tw`items-center justify-center py-8`}>
            <ActivityIndicator size="large" color={EMERALD} />
          </View>
        ) : null}

        <View style={tw`bg-white px-4 pt-4 pb-3 border-b border-stone-100`}>
          <Text style={tw`text-2xl font-bold text-stone-900`}>Business Settings</Text>
          <Text style={tw`text-sm text-stone-500 mt-1`}>Manage your business account</Text>
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Business information</Text>
          <Text style={tw`text-sm text-stone-600 mb-1`}>Business name</Text>
          <TextInput
            value={businessName}
            onChangeText={setBusinessName}
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
            placeholder="My Business"
            placeholderTextColor="#A8A29E"
          />
          <Text style={tw`text-sm text-stone-600 mb-1`}>Logo URL</Text>
          <TextInput
            value={logoUrl}
            onChangeText={setLogoUrl}
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
            placeholder="https://..."
            placeholderTextColor="#A8A29E"
            autoCapitalize="none"
          />
          <View style={tw`flex-row items-center py-2`}>
            <Ionicons name="mail-outline" size={20} color="#78716C" />
            <Text style={tw`text-stone-600 ml-3`}>{user?.email}</Text>
          </View>
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Notifications</Text>
          {[
            { label: 'Push notifications', value: notificationsEnabled, onChange: setNotificationsEnabled, icon: 'notifications-outline' as const },
            { label: 'Email notifications', value: emailNotifications, onChange: setEmailNotifications, icon: 'mail-outline' as const },
            { label: 'Marketing updates', value: pushNotifications, onChange: setPushNotifications, icon: 'megaphone-outline' as const },
          ].map((row, idx, arr) => (
            <View
              key={row.label}
              style={tw`flex-row items-center justify-between py-3 ${idx < arr.length - 1 ? 'border-b border-stone-100' : ''}`}
            >
              <View style={tw`flex-row items-center flex-1 pr-3`}>
                <Ionicons name={row.icon} size={20} color="#78716C" />
                <Text style={tw`text-stone-900 ml-3`}>{row.label}</Text>
              </View>
              <Switch
                value={row.value}
                onValueChange={row.onChange}
                trackColor={{ false: '#D6D3D1', true: EMERALD }}
                thumbColor="#FFFFFF"
              />
            </View>
          ))}
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Analytics preferences</Text>
          <Text style={tw`text-sm text-stone-600 mb-1`}>Low stock threshold (units)</Text>
          <TextInput
            value={lowStockThreshold}
            onChangeText={setLowStockThreshold}
            keyboardType="numeric"
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mb-3 text-stone-900`}
            placeholder="10"
            placeholderTextColor="#A8A29E"
          />
          <Text style={tw`text-sm text-stone-600 mb-1`}>Default shipping note</Text>
          <TextInput
            value={defaultShippingNote}
            onChangeText={setDefaultShippingNote}
            multiline
            numberOfLines={3}
            style={tw`bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-900 min-h-[80px]`}
            placeholder="Ships within 2 business days…"
            placeholderTextColor="#A8A29E"
            textAlignVertical="top"
          />
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Storefront</Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border border-emerald-200 bg-emerald-50 rounded-xl px-3`}
            onPress={openStorefrontPreview}
          >
            <View style={tw`flex-row items-center flex-1`}>
              <Ionicons name="storefront-outline" size={22} color={EMERALD} />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-semibold text-emerald-900`}>Preview storefront</Text>
                <Text style={tw`text-xs text-emerald-700 mt-0.5`}>How shoppers see your products</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={EMERALD} />
          </TouchableOpacity>
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Shortcuts</Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-100`}
            onPress={() => stackNav.navigate('BusinessMessages')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="chatbubbles-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3`}
            onPress={() => navigateFromRoot(navigation, 'Legal')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="document-text-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Terms & policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
        </View>

        <View style={tw`bg-white px-4 py-4 mb-3 border-b border-stone-100`}>
          <Text style={tw`text-lg font-semibold text-stone-900 mb-3`}>Support</Text>
          <TouchableOpacity
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={tw`flex-row items-center justify-between py-3`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="mail-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Contact support</Text>
            </View>
            <Text style={tw`text-xs text-stone-500`}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`px-4 pb-2 pt-2`}>
          <TouchableOpacity
            onPress={() => void saveSettings()}
            disabled={saving || loading}
            style={tw`bg-emerald-600 rounded-xl py-3.5 items-center ${saving || loading ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-semibold`}>{saving ? 'Saving…' : 'Save settings'}</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`px-4 py-4 mb-6`}>
          <TouchableOpacity
            onPress={() => void handleSignOut()}
            style={tw`bg-red-50 border border-red-200 rounded-xl py-4 flex-row items-center justify-center`}
          >
            <Ionicons name="log-out-outline" size={20} color="#EF4444" style={tw`mr-2`} />
            <Text style={tw`text-red-600 font-bold text-base`}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
