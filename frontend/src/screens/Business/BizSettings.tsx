import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
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
import tw, { theme } from '../../lib/tw';
import PressableScale from '../../components/ui/PressableScale';
import { haptic } from '../../theme/haptics';
import PrimaryButton from '../../components/ui/PrimaryButton';
import {
  KeyboardDoneAccessory,
  formInputAccessoryProps,
} from '../../components/ui/KeyboardDoneAccessory';
import { resetNavigationToAuth, navigateFromRoot } from '../../app/navigation/rootNavigation';
import { SUPPORT_EMAIL } from '../../content/legal';
import {
  updateBusinessSettings,
  exportOrdersCsv,
  exportProductsCsv,
} from '../../services/api/business';
import { uploadMediaFile } from '../../services/api/media';
import { fetchBusinessSettings } from '../../store/slices/businessSlice';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { toast } from '../../state/useToastStore';
import { downloadCsv } from '../../utils/csvDownload';
import { verticalScrollProps } from '../../constants/scroll';
import { featureFlags } from '../../constants/featureFlags';

const EMERALD = '#059669';

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
          const uploaded = await uploadMediaFile(localUri, 'product');
          persistableLogo = uploaded.url;
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
      toast.success('Settings saved');
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

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['bottom']}>
      <ScrollView style={tw`flex-1`} {...verticalScrollProps}>
        {loading ? (
          <View style={tw`items-center justify-center py-8`}>
            <ActivityIndicator size="large" color={EMERALD} />
          </View>
        ) : null}

        <View style={tw`px-gutter-wide pt-4 pb-3`}>
          <Text style={tw`text-lg font-bold text-ink`}>Business settings</Text>
          <Text style={tw`text-sm text-ink-3 mt-0.5`}>Store profile, ops, exports, and account</Text>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Business
          </Text>
          <Text style={tw`text-sm text-ink-2 mb-1`}>Business name</Text>
          <TextInput
                        {...formInputAccessoryProps()}
            value={businessName}
            onChangeText={setBusinessName}
            style={tw`bg-card border border-line/80 rounded-card px-3 py-2.5 mb-3 text-ink`}
            placeholder="My Business"
            placeholderTextColor={theme.colors.ink3}
          />
          <Text style={tw`text-sm text-ink-2 mb-2`}>Logo</Text>
          <View style={tw`flex-row items-center mb-3`}>
            {logoPreview ? (
              <Image source={{ uri: logoPreview }} style={tw`w-16 h-16 rounded-control mr-3`} contentFit="cover" />
            ) : (
              <View style={tw`w-16 h-16 rounded-control mr-3 bg-raised items-center justify-center`}>
                <Ionicons name="storefront-outline" size={28} color={theme.colors.iconMuted} />
              </View>
            )}
            <PressableScale
              onPress={() => void pickLogo()}
              style={tw`px-4 py-2.5 bg-raised border border-line/80 rounded-control`}
            >
              <Text style={tw`text-sm font-semibold text-emerald-800`}>Choose image</Text>
            </PressableScale>
          </View>
          <View style={tw`flex-row items-center py-2`}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.ink3} />
            <Text style={tw`text-ink-2 ml-3`}>{user?.email}</Text>
          </View>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Ops
          </Text>
          <Text style={tw`text-sm text-ink-2 mb-1`}>Low stock threshold (units)</Text>
          <TextInput
                        {...formInputAccessoryProps()}
            value={lowStockThreshold}
            onChangeText={setLowStockThreshold}
            keyboardType="numeric"
            style={tw`bg-card border border-line/80 rounded-card px-3 py-2.5 mb-3 text-ink`}
            placeholder="10"
            placeholderTextColor={theme.colors.ink3}
          />
          <Text style={tw`text-sm text-ink-2 mb-1`}>Default shipping note</Text>
          <TextInput
            {...formInputAccessoryProps({ multiline: true })}
            value={defaultShippingNote}
            onChangeText={setDefaultShippingNote}
            multiline
            numberOfLines={3}
            style={tw`bg-card border border-line/80 rounded-card px-3 py-2.5 text-ink min-h-[80px]`}
            placeholder="Ships within 2 business days…"
            placeholderTextColor={theme.colors.ink3}
            textAlignVertical="top"
          />
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Notifications
          </Text>
          <View style={tw`flex-row items-center justify-between py-2`}>
            <View style={tw`flex-row items-center flex-1 pr-3`}>
              <Ionicons name="notifications-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>In-app alerts</Text>
            </View>
            <Switch
              value={inAppAlerts}
              onValueChange={(v) => {
                haptic('selection');
                setInAppAlerts(v);
              }}
              trackColor={{ false: theme.colors.iconMuted, true: EMERALD }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Payouts
          </Text>
          <Text style={tw`text-sm text-ink-3 leading-5`}>
            Payouts aren't enabled yet. No balance is available to withdraw.
          </Text>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Export
          </Text>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 border-b border-line/60 ${exportBusy ? 'opacity-60' : ''}`}
            disabled={!!exportBusy}
            onPress={() => void handleExportOrders()}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="download-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Export orders (CSV)</Text>
            </View>
            {exportBusy === 'orders' ? (
              <ActivityIndicator size="small" color={EMERALD} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
            )}
          </PressableScale>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 ${exportBusy ? 'opacity-60' : ''}`}
            disabled={!!exportBusy}
            onPress={() => void handleExportProducts()}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="download-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Export products (CSV)</Text>
            </View>
            {exportBusy === 'products' ? (
              <ActivityIndicator size="small" color={EMERALD} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
            )}
          </PressableScale>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Storefront
          </Text>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3`}
            onPress={openStorefrontPreview}
          >
            <View style={tw`flex-row items-center flex-1`}>
              <Ionicons name="storefront-outline" size={22} color={EMERALD} />
              <View style={tw`ml-3 flex-1`}>
                <Text style={tw`font-semibold text-ink`}>Your products</Text>
                <Text style={tw`text-xs text-ink-3 mt-0.5`}>Open catalog tab</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Shortcuts
          </Text>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
            onPress={() => stackNav.navigate('BusinessCustomers')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="people-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Customers</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
            onPress={() => stackNav.navigate('BusinessMessages')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="chatbubbles-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Messages</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
            onPress={() => stackNav.navigate('BusinessCreatePost')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="create-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Create post</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
          <PressableScale
            style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
            onPress={() => stackNav.navigate('BusinessAnalytics')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="analytics-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Analytics</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
          {featureFlags.enableKYC ? (
            <PressableScale
              style={tw`flex-row items-center justify-between py-3 border-b border-line/60`}
              onPress={() => stackNav.navigate('BusinessKYC')}
            >
              <View style={tw`flex-row items-center`}>
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.ink3} />
                <Text style={tw`text-ink ml-3`}>Identity verification</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
            </PressableScale>
          ) : null}
          <PressableScale
            style={tw`flex-row items-center justify-between py-3`}
            onPress={() => navigateFromRoot(navigation, 'Legal')}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="document-text-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Terms & policies</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.iconMuted} />
          </PressableScale>
        </View>

        <View style={tw`px-gutter-wide py-4 border-b border-line/70`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-3`}>
            Support
          </Text>
          <PressableScale
            onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={tw`flex-row items-center justify-between py-3`}
          >
            <View style={tw`flex-row items-center`}>
              <Ionicons name="mail-outline" size={20} color={theme.colors.ink3} />
              <Text style={tw`text-ink ml-3`}>Contact support</Text>
            </View>
            <Text style={tw`text-xs text-ink-3`}>{SUPPORT_EMAIL}</Text>
          </PressableScale>
        </View>

        <View style={tw`px-gutter-wide pb-2 pt-4`}>
          <PrimaryButton
            label={saving ? 'Saving…' : 'Save settings'}
            onPress={() => void saveSettings()}
            disabled={saving || loading}
            loading={saving}
          />
        </View>

        <View style={tw`px-gutter-wide py-4 mb-6`}>
          <PressableScale
            onPress={() => void handleSignOut()}
            style={tw`py-4 flex-row items-center justify-center`}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.colors.danger} style={tw`mr-2`} />
            <Text style={tw`text-red-600 font-bold text-base`}>Sign out</Text>
          </PressableScale>
        </View>
      </ScrollView>
      <KeyboardDoneAccessory />
    </SafeAreaView>
  );
}
