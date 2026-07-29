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
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useAppDispatch, useAppSelector } from '../../store/hooks';
import tw from '../../lib/tw';
import { resetNavigationToAuth, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { SUPPORT_EMAIL } from '../../content/legal';
import {
  updateBusinessSettings,
  exportOrdersCsv,
  exportProductsCsv,
} from '../../services/api/business';
import { uploadMediaApi } from '../../services/api/media';
import { fetchBusinessSettings } from '../../store/slices/businessSlice';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { downloadCsv } from '../../utils/csvDownload';
import { verticalScrollProps } from '../../constants/scroll';
import { featureFlags } from '../../constants/featureFlags';

const EMERALD = '#059669';

async function uriToDataUrl(uri: string): Promise<string> {
  const lower = uri.toLowerCase();
  if (lower.startsWith('data:')) return uri;

  const res = await fetch(uri);
  const blob = await res.blob();

  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  const mime = blob.type || (lower.includes('.png') ? 'image/png' : 'image/jpeg');
  return `data:${mime};base64,${base64}`;
}

export default function BizSettings() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const savedSettings = useAppSelector((s) => s.business.settings);
  const period = useAppSelector((s) => s.business.period);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportBusy, setExportBusy] = useState<'orders' | 'products' | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoLocalUri, setLogoLocalUri] = useState<string | null>(null);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [defaultShippingNote, setDefaultShippingNote] = useState('');

  const applySettings = useCallback((data: NonNullable<typeof savedSettings>) => {
    setBusinessName(data.business_name || '');
    setLogoUrl(data.logo_url || '');
    setLogoLocalUri(null);
    const notif = (data.notifications_prefs || {}) as Record<string, unknown>;
    setInAppAlerts(Boolean(notif.inAppAlerts ?? notif.notificationsEnabled ?? true));
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

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Photo library access is required for your logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setLogoLocalUri(result.assets[0].uri);
    }
  };

  const saveSettings = async () => {
    const threshold = Number(lowStockThreshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      alertMessage('Invalid threshold', 'Low stock threshold must be a non-negative number.');
      return;
    }
    try {
      setSaving(true);
      let persistableLogo = logoUrl.trim() || undefined;
      const localUri = logoLocalUri;
      if (localUri) {
        const lower = localUri.toLowerCase();
        const needsUpload = !lower.startsWith('http://') && !lower.startsWith('https://');
        if (needsUpload) {
          const dataUrl = await uriToDataUrl(localUri);
          persistableLogo = await uploadMediaApi(dataUrl, 'product');
        } else {
          persistableLogo = localUri;
        }
      }

      await updateBusinessSettings({
        business_name: businessName.trim() || undefined,
        logo_url: persistableLogo,
        notifications_prefs: { inAppAlerts, notificationsEnabled: inAppAlerts },
        analytics_prefs: {
          low_stock_threshold: threshold,
          default_shipping_note: defaultShippingNote.trim(),
        },
      });
      await dispatch(fetchBusinessSettings()).unwrap();
      setLogoLocalUri(null);
      alertMessage('Saved', 'Business settings updated.');
    } catch (e: unknown) {
      alertMessage('Error', e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleExportOrders = async () => {
    try {
      setExportBusy('orders');
      const csv = await exportOrdersCsv(period);
      await downloadCsv(`orders-${period}.csv`, csv);
    } catch (e: unknown) {
      alertMessage('Export failed', e instanceof Error ? e.message : 'Could not export orders');
    } finally {
      setExportBusy(null);
    }
  };

  const handleExportProducts = async () => {
    try {
      setExportBusy('products');
      const csv = await exportProductsCsv();
      await downloadCsv('products.csv', csv);
    } catch (e: unknown) {
      alertMessage('Export failed', e instanceof Error ? e.message : 'Could not export products');
    } finally {
      setExportBusy(null);
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
    const tabNav = navigation.getParent?.()?.getParent?.() || navigation.getParent?.() || navigation;
    tabNav.navigate('BusinessMain', { screen: 'Catalog' });
  };

  const stackNav = navigation.getParent?.() || navigation;
  const logoPreview = logoLocalUri || logoUrl || null;
  const net = useAppSelector((s) => s.business.kpis?.net_revenue ?? s.business.kpis?.total_revenue ?? 0);

  return (
    <SafeAreaView style={tw`flex-1 bg-surface-page`} edges={['bottom']}>
      <ScrollView style={tw`flex-1`} {...verticalScrollProps}>
        {loading ? (
          <View style={tw`items-center justify-center py-8`}>
            <ActivityIndicator size="large" color={EMERALD} />
          </View>
        ) : null}

        <View style={tw`px-5 pt-4 pb-3`}>
          <Text style={tw`text-lg font-bold text-stone-900`}>Business settings</Text>
          <Text style={tw`text-sm text-stone-500 mt-0.5`}>Store profile, ops, exports, and account</Text>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Business
          </Text>
          <Text style={tw`text-sm text-stone-600 mb-1`}>Business name</Text>
          <TextInput
            value={businessName}
            onChangeText={setBusinessName}
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-2.5 mb-3 text-stone-900`}
            placeholder="My Business"
            placeholderTextColor="#A8A29E"
          />
          <Text style={tw`text-sm text-stone-600 mb-2`}>Logo</Text>
          <View style={tw`flex-row items-center mb-3`}>
            {logoPreview ? (
              <Image source={{ uri: logoPreview }} style={tw`w-16 h-16 rounded-xl mr-3`} contentFit="cover" />
            ) : (
              <View style={tw`w-16 h-16 rounded-xl mr-3 bg-[#EAE4D6] items-center justify-center`}>
                <Ionicons name="storefront-outline" size={28} color="#A8A29E" />
              </View>
            )}
            <TouchableOpacity
              onPress={() => void pickLogo()}
              style={tw`px-4 py-2.5 bg-[#EAE4D6] border border-stone-200/80 rounded-xl`}
            >
              <Text style={tw`text-sm font-semibold text-emerald-800`}>Choose image</Text>
            </TouchableOpacity>
          </View>
          <View style={tw`flex-row items-center py-2`}>
            <Ionicons name="mail-outline" size={20} color="#78716C" />
            <Text style={tw`text-stone-600 ml-3`}>{user?.email}</Text>
          </View>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Ops
          </Text>
          <Text style={tw`text-sm text-stone-600 mb-1`}>Low stock threshold (units)</Text>
          <TextInput
            value={lowStockThreshold}
            onChangeText={setLowStockThreshold}
            keyboardType="numeric"
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-2.5 mb-3 text-stone-900`}
            placeholder="10"
            placeholderTextColor="#A8A29E"
          />
          <Text style={tw`text-sm text-stone-600 mb-1`}>Default shipping note</Text>
          <TextInput
            value={defaultShippingNote}
            onChangeText={setDefaultShippingNote}
            multiline
            numberOfLines={3}
            style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3 py-2.5 text-stone-900 min-h-[80px]`}
            placeholder="Ships within 2 business days…"
            placeholderTextColor="#A8A29E"
            textAlignVertical="top"
          />
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Notifications
          </Text>
          <View style={tw`flex-row items-center justify-between py-2`}>
            <View style={tw`flex-row items-center flex-1 pr-3`}>
              <Ionicons name="notifications-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>In-app alerts</Text>
            </View>
            <Switch
              value={inAppAlerts}
              onValueChange={setInAppAlerts}
              trackColor={{ false: '#D6D3D1', true: EMERALD }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Payouts
          </Text>
          <View style={tw`flex-row`}>
            <View style={tw`flex-1 pr-4`}>
              <Text style={tw`text-xs text-stone-500`}>Available</Text>
              <Text style={tw`text-lg font-bold text-emerald-700`}>${(net * 0.92).toFixed(2)}</Text>
            </View>
            <View style={tw`flex-1 border-l border-stone-200/80 pl-4`}>
              <Text style={tw`text-xs text-stone-500`}>Fee hold</Text>
              <Text style={tw`text-lg font-bold text-stone-800`}>${(net * 0.08).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Export
          </Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60 ${exportBusy ? 'opacity-60' : ''}`}
            disabled={!!exportBusy}
            onPress={() => void handleExportOrders()}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="download-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Export orders (CSV)</Text>
            </View>
            {exportBusy === 'orders' ? (
              <ActivityIndicator size="small" color={EMERALD} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 ${exportBusy ? 'opacity-60' : ''}`}
            disabled={!!exportBusy}
            onPress={() => void handleExportProducts()}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="download-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Export products (CSV)</Text>
            </View>
            {exportBusy === 'products' ? (
              <ActivityIndicator size="small" color={EMERALD} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
            )}
          </TouchableOpacity>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Storefront
          </Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3`}
            onPress={openStorefrontPreview}
          >
            <View style={tw`flex-row items-center flex-1`}>
              <Ionicons name="storefront-outline" size={22} color={EMERALD} />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-semibold text-stone-900`}>Your products</Text>
                <Text style={tw`text-xs text-stone-500 mt-0.5`}>Open catalog tab</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
        </View>

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Shortcuts
          </Text>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60`}
            onPress={() => stackNav.navigate('BusinessCustomers')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="people-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Customers</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60`}
            onPress={() => stackNav.navigate('BusinessMessages')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="chatbubbles-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60`}
            onPress={() => stackNav.navigate('BusinessCreatePost')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="create-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Create post</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60`}
            onPress={() => stackNav.navigate('BusinessAnalytics')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="analytics-outline" size={20} color="#78716C" />
              <Text style={tw`text-stone-900 ml-3`}>Analytics</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
          </TouchableOpacity>
          {featureFlags.enableKYC ? (
            <TouchableOpacity
              style={tw`flex-row items-center justify-between py-3 border-b border-stone-200/60`}
              onPress={() => stackNav.navigate('BusinessKYC')}
            >
              <View style={tw`flex-row items-center`}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#78716C" />
                <Text style={tw`text-stone-900 ml-3`}>Identity verification</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#A8A29E" />
            </TouchableOpacity>
          ) : null}
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

        <View style={tw`px-5 py-4 border-b border-stone-200/70`}>
          <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-3`}>
            Support
          </Text>
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

        <View style={tw`px-5 pb-2 pt-4`}>
          <TouchableOpacity
            onPress={() => void saveSettings()}
            disabled={saving || loading}
            style={tw`bg-emerald-600 rounded-2xl py-3.5 items-center ${saving || loading ? 'opacity-60' : ''}`}
          >
            <Text style={tw`text-white font-semibold`}>{saving ? 'Saving…' : 'Save settings'}</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`px-5 py-4 mb-6`}>
          <TouchableOpacity
            onPress={() => void handleSignOut()}
            style={tw`py-4 flex-row items-center justify-center`}
          >
            <Ionicons name="log-out-outline" size={20} color="#DC2626" style={tw`mr-2`} />
            <Text style={tw`text-red-600 font-bold text-base`}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
