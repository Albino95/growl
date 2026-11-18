import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, usePreventRemove, type RouteProp } from '@react-navigation/native';
import tw, { theme } from '../../lib/tw';
import ScreenHeader from '../../components/ui/ScreenHeader';
import PressableScale from '../../components/ui/PressableScale';
import PrimaryButton from '../../components/ui/PrimaryButton';
import StickyFooter from '../../components/ui/StickyFooter';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import GrowImage from '../../components/ui/GrowImage';
import Chip from '../../components/ui/Chip';
import { KeyboardDoneAccessory, formInputAccessoryProps } from '../../components/ui/KeyboardDoneAccessory';
import StorefrontPreview from '../../components/business/StorefrontPreview';
import VerificationSheet from '../../components/storefront/VerificationSheet';
import VerifiedBadge from '../../components/storefront/VerifiedBadge';
import CATEGORIES from '../../data/categories';
import { useAuth } from '../../store/hooks';
import { haptic, toggleFeedback } from '../../theme/haptics';
import { toast } from '../../state/useToastStore';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { formatCurrency } from '../../utils/money';
import { resolveProductImageUri, resolvePostMediaUri } from '../../utils/images';
import { verticalScrollProps, horizontalScrollProps } from '../../constants/scroll';
import { ApiError } from '../../services/api/http';
import { uploadMediaFile } from '../../services/api/media';
import { getBusinessProducts, getBusinessSettings, type BusinessProduct } from '../../services/api/business';
import { getUserPosts, type FeedPost } from '../../services/api/feed';
import {
  DAY_LABELS,
  STOREFRONT_LIMITS as L,
  getMyStorefront,
  getMyVerification,
  isHttpsLink,
  normalizeLink,
  saveMyStorefront,
  type Storefront,
  type StorefrontHours,
  type StorefrontLink,
  type StorefrontPinnedPost,
  type VerificationState,
} from '../../services/api/storefront';

type EditorRouteParams = { BusinessStorefront: { openVerification?: boolean } | undefined };

/** Editable form state: strings everywhere, converted to the API shape on save. */
type Draft = {
  cover_url: string | null;
  tagline: string;
  about: string;
  links: StorefrontLink[];
  path_tags: string[];
  featured_product_ids: string[];
  pinned_post_id: string | null;
  location_label: string;
  pickup_note: string;
  /** One slot per day (index = day 0–6); null = closed. */
  hours: Array<{ open: string; close: string } | null>;
  shipping: string;
  returns: string;
  pickup: string;
};

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toDraft(sf: Storefront): Draft {
  const hours: Draft['hours'] = Array.from({ length: 7 }, () => null);
  for (const h of sf.hours) {
    if (!hours[h.day]) hours[h.day] = { open: h.open, close: h.close };
  }
  return {
    cover_url: sf.cover_url,
    tagline: sf.tagline || '',
    about: sf.about || '',
    links: sf.links.map((l) => ({ ...l })),
    path_tags: [...sf.path_tags],
    featured_product_ids: [...sf.featured_product_ids],
    pinned_post_id: sf.pinned_post_id,
    location_label: sf.location_label || '',
    pickup_note: sf.pickup_note || '',
    hours,
    shipping: sf.policies.shipping || '',
    returns: sf.policies.returns || '',
    pickup: sf.policies.pickup || '',
  };
}

function draftHours(d: Draft): StorefrontHours[] {
  const out: StorefrontHours[] = [];
  d.hours.forEach((h, day) => {
    if (h) out.push({ day, open: h.open.trim(), close: h.close.trim() });
  });
  return out;
}

function toStorefront(businessId: string, d: Draft): Storefront {
  const t = (s: string) => s.trim() || null;
  return {
    business_id: businessId,
    cover_url: d.cover_url,
    tagline: t(d.tagline),
    about: t(d.about),
    links: d.links.map((l) => ({ label: l.label.trim(), url: normalizeLink(l.url) })).filter((l) => l.label || l.url),
    path_tags: d.path_tags,
    featured_product_ids: d.featured_product_ids,
    pinned_post_id: d.pinned_post_id,
    location_label: t(d.location_label),
    pickup_note: t(d.pickup_note),
    hours: draftHours(d),
    policies: { shipping: t(d.shipping), returns: t(d.returns), pickup: t(d.pickup) },
    updated_at: null,
  };
}

/** First problem a shopper-facing save would hit, or null. Mirrors the server rules. */
function validate(sf: Storefront): string | null {
  for (const l of sf.links) {
    if (!l.label) return 'Give every link a short label, like “Website”.';
    if (!isHttpsLink(l.url)) return `“${l.label}” needs a full https:// address.`;
  }
  for (const h of sf.hours) {
    if (!HHMM.test(h.open) || !HHMM.test(h.close)) {
      return `Use 24-hour times like 09:00 for ${DAY_LABELS[h.day]}.`;
    }
    if (h.open >= h.close) return `${DAY_LABELS[h.day]}: closing time must be after opening time.`;
  }
  return null;
}

function Counter({ value, max }: { value: string; max: number }) {
  const near = value.length > max * 0.9;
  return (
    <Text style={tw`text-caption ${near ? 'text-amber-700' : 'text-ink-3'} text-right mt-1`}>
      {value.length}/{max}
    </Text>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={tw`px-gutter py-5 border-b border-line`}>
      <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase`}>{title}</Text>
      {hint ? <Text style={tw`text-footnote text-ink-3 mt-1`}>{hint}</Text> : null}
      <View style={tw`mt-3`}>{children}</View>
    </View>
  );
}

export default function StorefrontEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<EditorRouteParams, 'BusinessStorefront'>>();
  const { user } = useAuth();

  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [businessId, setBusinessId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const savedJson = useRef('');
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [verificationOpen, setVerificationOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const sf = await getMyStorefront();
      setBusinessId(sf.business_id);
      const d = toDraft(sf);
      setDraft(d);
      savedJson.current = JSON.stringify(toStorefront(sf.business_id, d));
      setState('ready');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
      return;
    }
    // Pickers + header data: each degrades on its own.
    getBusinessProducts('month')
      .then((r) => setProducts(Array.isArray(r?.data?.products) ? r.data.products : []))
      .catch(() => undefined);
    if (user?.id) {
      getUserPosts(user.id)
        .then((p) => setPosts(p.slice(0, 30)))
        .catch(() => undefined);
    }
    getBusinessSettings()
      .then((r) => {
        setBusinessName(r?.data?.business_name || '');
        setLogoUrl(r?.data?.logo_url || null);
      })
      .catch(() => undefined);
    getMyVerification()
      .then(setVerification)
      .catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.openVerification && state === 'ready') setVerificationOpen(true);
  }, [route.params?.openVerification, state]);

  const current = useMemo(() => (draft ? toStorefront(businessId, draft) : null), [draft, businessId]);
  const dirty = !!current && JSON.stringify(current) !== savedJson.current;

  usePreventRemove(dirty && !saving, ({ data }) => {
    void confirmAsync('Discard changes?', 'Your storefront edits haven’t been saved.', {
      confirmLabel: 'Discard',
      destructive: true,
    }).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const activeProducts = products.filter((p) => !p.is_hidden);
  const pinnedPost: StorefrontPinnedPost | null = useMemo(() => {
    const p = posts.find((x) => x.id === draft?.pinned_post_id);
    return p
      ? {
          id: p.id,
          image_url: p.image_url ? resolvePostMediaUri(p.image_url, p.category, p.id) : null,
          caption: p.caption || null,
          category: p.category,
          subcategory: p.subcategory || null,
          created_at: p.created_at,
        }
      : null;
  }, [posts, draft?.pinned_post_id]);

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      alertMessage('Photo access needed', 'Allow photo access to choose a cover image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingCover(true);
    try {
      // Reuses the public product upload purpose: covers are shop imagery.
      const uploaded = await uploadMediaFile(result.assets[0].uri, 'product');
      patch({ cover_url: uploaded.url });
      haptic('tapLight');
    } catch (e) {
      haptic('error');
      alertMessage('Upload failed', e instanceof Error ? e.message : 'Try another photo.');
    } finally {
      setUploadingCover(false);
    }
  };

  const togglePath = (key: string) => {
    if (!draft) return;
    const has = draft.path_tags.includes(key);
    if (!has && draft.path_tags.length >= L.pathTags) {
      toast.info(`Pick up to ${L.pathTags} paths`);
      return;
    }
    patch({ path_tags: has ? draft.path_tags.filter((k) => k !== key) : [...draft.path_tags, key] });
  };

  const toggleFeatured = (id: string) => {
    if (!draft) return;
    const has = draft.featured_product_ids.includes(id);
    if (!has && draft.featured_product_ids.length >= L.featured) {
      toast.info(`Feature up to ${L.featured} products`);
      return;
    }
    haptic('selection');
    patch({
      featured_product_ids: has
        ? draft.featured_product_ids.filter((x) => x !== id)
        : [...draft.featured_product_ids, id],
    });
  };

  const setLink = (i: number, p: Partial<StorefrontLink>) => {
    if (!draft) return;
    patch({ links: draft.links.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  };

  const setDay = (day: number, value: { open: string; close: string } | null) => {
    if (!draft) return;
    const hours = [...draft.hours];
    hours[day] = value;
    patch({ hours });
  };

  const save = async () => {
    if (!current) return;
    const problem = validate(current);
    if (problem) {
      haptic('warning');
      alertMessage('Almost there', problem);
      return;
    }
    setSaving(true);
    try {
      const saved = await saveMyStorefront({
        cover_url: current.cover_url,
        tagline: current.tagline,
        about: current.about,
        links: current.links,
        path_tags: current.path_tags,
        // Drop picks that were hidden/archived since they were chosen.
        featured_product_ids: current.featured_product_ids.filter((id) => activeProducts.some((p) => p.id === id) || !products.length),
        pinned_post_id: current.pinned_post_id,
        location_label: current.location_label,
        pickup_note: current.pickup_note,
        hours: current.hours,
        policies: current.policies,
      });
      const d = toDraft(saved);
      savedJson.current = JSON.stringify(toStorefront(saved.business_id, d));
      setDraft(d);
      haptic('success');
      toast.success('Storefront saved');
    } catch (e) {
      haptic('error');
      alertMessage('Couldn’t save', e instanceof Error ? e.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <ScreenHeader
      title="Storefront"
      onBack={() => navigation.goBack()}
      backIcon="arrow-back"
      rightAction={
        state === 'ready' ? (
          <PressableScale
            onPress={() => setPreviewOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Preview your storefront as customers see it"
            style={tw`flex-row items-center`}
          >
            <Ionicons name="eye-outline" size={18} color={theme.colors.leafInk} />
            <Text style={tw`ml-1 text-body font-semibold text-leaf-ink`}>Preview</Text>
          </PressableScale>
        ) : undefined
      }
    />
  );

  if (state === 'loading') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']} accessibilityState={{ busy: true }}>
        {header}
        <View style={tw`px-gutter pt-5`}>
          <Skeleton style={tw`h-36 w-full rounded-card`} />
          <Skeleton style={tw`h-10 w-full rounded-control mt-5`} />
          <Skeleton style={tw`h-24 w-full rounded-control mt-3`} />
        </View>
      </SafeAreaView>
    );
  }
  if (state === 'missing') {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <EmptyState
          icon="storefront-outline"
          title="Storefronts are coming soon"
          description="Your shop page isn’t available on this server yet. Check back after the next update."
        />
      </SafeAreaView>
    );
  }
  if (state === 'error' || !draft || !current) {
    return (
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
        {header}
        <ErrorState
          title="Couldn’t load your storefront"
          onRetry={() => {
            setState('loading');
            void load();
          }}
        />
      </SafeAreaView>
    );
  }

  const input = tw`bg-card border border-line rounded-control px-3 py-2.5 text-body text-ink`;
  const vStatus = verification?.status ?? 'none';

  return (
    <SafeAreaView style={tw`flex-1 bg-page`} edges={['top']}>
      {header}
      <ScrollView
        style={tw`flex-1`}
        {...verticalScrollProps}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={tw`pb-6`}
      >
        {/* Verification status */}
        <PressableScale
          onPress={() => setVerificationOpen(true)}
          style={tw`mx-gutter mt-4 flex-row items-center bg-card border border-line rounded-card px-4 py-3`}
          accessibilityRole="button"
          accessibilityLabel={`Verification: ${vStatus}`}
        >
          <Ionicons
            name={vStatus === 'verified' ? 'checkmark-circle' : vStatus === 'rejected' ? 'alert-circle-outline' : 'shield-outline'}
            size={22}
            color={vStatus === 'verified' ? theme.colors.brand : vStatus === 'rejected' ? theme.colors.danger : theme.colors.icon}
          />
          <View style={tw`flex-1 ml-3`}>
            <View style={tw`flex-row items-center`}>
              <Text style={tw`text-body font-semibold text-ink`}>
                {vStatus === 'verified'
                  ? 'Verified business'
                  : vStatus === 'pending'
                    ? 'Verification in review'
                    : vStatus === 'rejected'
                      ? 'Verification needs another look'
                      : 'Get verified'}
              </Text>
              {vStatus === 'verified' ? <VerifiedBadge size={14} /> : null}
            </View>
            <Text style={tw`text-caption text-ink-3 mt-0.5`}>
              {vStatus === 'verified'
                ? 'Shoppers see your verified seal'
                : vStatus === 'pending'
                  ? 'We’ll notify you when it’s done'
                  : 'A verified seal builds trust with shoppers'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.iconMuted} />
        </PressableScale>

        <Section title="Cover" hint="A wide photo of your shop, products or team.">
          <PressableScale
            onPress={() => void pickCover()}
            disabled={uploadingCover}
            style={tw`rounded-card overflow-hidden border border-line bg-raised`}
            accessibilityRole="button"
            accessibilityLabel={draft.cover_url ? 'Change cover photo' : 'Add a cover photo'}
          >
            {draft.cover_url ? (
              <GrowImage source={{ uri: draft.cover_url }} style={tw`w-full h-40`} contentFit="cover" />
            ) : (
              <View style={tw`w-full h-36 items-center justify-center`}>
                <Ionicons name="image-outline" size={28} color={theme.colors.iconMuted} />
                <Text style={tw`text-footnote text-ink-2 mt-1`}>Add a cover photo</Text>
              </View>
            )}
            {uploadingCover ? (
              <View style={[tw`absolute inset-0 items-center justify-center`, { backgroundColor: theme.colors.overlay }]}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
          </PressableScale>
          {draft.cover_url ? (
            <PressableScale
              onPress={() => patch({ cover_url: null })}
              style={tw`self-start mt-2`}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove cover photo"
            >
              <Text style={tw`text-footnote font-semibold text-red-600`}>Remove cover</Text>
            </PressableScale>
          ) : null}
        </Section>

        <Section title="About">
          <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>Tagline</Text>
          <TextInput
            {...formInputAccessoryProps()}
            value={draft.tagline}
            onChangeText={(v) => patch({ tagline: v })}
            maxLength={L.tagline}
            placeholder="Handmade yoga mats from Luxembourg"
            placeholderTextColor={theme.colors.placeholder}
            style={input}
            accessibilityLabel="Tagline"
          />
          <Counter value={draft.tagline} max={L.tagline} />
          <Text style={tw`text-footnote font-semibold text-ink-2 mb-1 mt-2`}>About your business</Text>
          <TextInput
            {...formInputAccessoryProps({ multiline: true })}
            value={draft.about}
            onChangeText={(v) => patch({ about: v })}
            maxLength={L.about}
            multiline
            textAlignVertical="top"
            placeholder="Who you are, what you make, why it helps people grow."
            placeholderTextColor={theme.colors.placeholder}
            style={[input, tw`min-h-[120px]`]}
            accessibilityLabel="About your business"
          />
          <Counter value={draft.about} max={L.about} />
        </Section>

        <Section title="Paths" hint={`Which growth paths fit your shop? Up to ${L.pathTags}.`}>
          <View style={tw`flex-row flex-wrap`}>
            {CATEGORIES.map((c) => (
              <Chip key={c.key} selected={draft.path_tags.includes(c.key)} onPress={() => togglePath(c.key)}>
                {c.label}
              </Chip>
            ))}
          </View>
        </Section>

        <Section title="Links" hint="Your website, booking page or socials. Opens in the shopper’s browser.">
          {draft.links.map((l, i) => {
            const bad = !!l.url.trim() && !isHttpsLink(normalizeLink(l.url));
            return (
              <View key={i} style={tw`mb-3`}>
                <View style={tw`flex-row items-center`}>
                  <TextInput
                    {...formInputAccessoryProps()}
                    value={l.label}
                    onChangeText={(v) => setLink(i, { label: v })}
                    maxLength={L.linkLabel}
                    placeholder="Label"
                    placeholderTextColor={theme.colors.placeholder}
                    style={[input, tw`w-28 mr-2`]}
                    accessibilityLabel={`Link ${i + 1} label`}
                  />
                  <TextInput
                    {...formInputAccessoryProps()}
                    value={l.url}
                    onChangeText={(v) => setLink(i, { url: v })}
                    onBlur={() => setLink(i, { url: normalizeLink(l.url) })}
                    placeholder="https://"
                    placeholderTextColor={theme.colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={[input, tw`flex-1 ${bad ? 'border-red-400' : ''}`]}
                    accessibilityLabel={`Link ${i + 1} address`}
                  />
                  <PressableScale
                    onPress={() => patch({ links: draft.links.filter((_, j) => j !== i) })}
                    hitSlop={8}
                    style={tw`ml-2 p-1`}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove link ${i + 1}`}
                  >
                    <Ionicons name="close-circle" size={22} color={theme.colors.iconMuted} />
                  </PressableScale>
                </View>
                {bad ? <Text style={tw`text-caption text-red-600 mt-1`}>Use a full https:// address</Text> : null}
              </View>
            );
          })}
          {draft.links.length < L.links ? (
            <PressableScale
              onPress={() => patch({ links: [...draft.links, { label: '', url: '' }] })}
              style={tw`flex-row items-center self-start py-1`}
              accessibilityRole="button"
              accessibilityLabel="Add a link"
            >
              <Ionicons name="add-circle-outline" size={20} color={theme.colors.leafInk} />
              <Text style={tw`ml-1.5 text-body font-semibold text-leaf-ink`}>Add link</Text>
            </PressableScale>
          ) : null}
        </Section>

        <Section
          title={`Featured products · ${draft.featured_product_ids.length}/${L.featured}`}
          hint="Shown first on your storefront, in the order you pick them."
        >
          {activeProducts.length === 0 ? (
            <Text style={tw`text-footnote text-ink-3`}>Add products to your catalog to feature them here.</Text>
          ) : (
            <View style={tw`flex-row flex-wrap -mx-1`}>
              {activeProducts.map((p) => {
                const order = draft.featured_product_ids.indexOf(p.id);
                const selected = order >= 0;
                const uri = resolveProductImageUri(p.image_url, p.images);
                return (
                  <View key={p.id} style={tw`w-1/3 px-1 mb-2`}>
                    <PressableScale
                      onPress={() => toggleFeatured(p.id)}
                      style={tw`rounded-control overflow-hidden border-2 ${selected ? 'border-brand-600' : 'border-line'} bg-card`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${p.name}${selected ? `, featured number ${order + 1}` : ''}`}
                    >
                      {uri ? (
                        <GrowImage source={{ uri }} style={tw`w-full h-20 bg-raised`} contentFit="cover" />
                      ) : (
                        <View style={tw`w-full h-20 bg-raised items-center justify-center`}>
                          <Ionicons name="image-outline" size={18} color={theme.colors.iconMuted} />
                        </View>
                      )}
                      <View style={tw`px-1.5 py-1`}>
                        <Text style={tw`text-caption font-semibold text-ink`} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={tw`text-caption text-ink-3`}>{formatCurrency(Number(p.price || 0))}</Text>
                      </View>
                      {selected ? (
                        <View style={tw`absolute top-1 right-1 w-6 h-6 rounded-full bg-brand-600 items-center justify-center`}>
                          <Text style={tw`text-caption font-bold text-white`}>{order + 1}</Text>
                        </View>
                      ) : null}
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        <Section title="Pinned post" hint="One of your posts, shown near the top of your storefront.">
          {posts.length === 0 ? (
            <Text style={tw`text-footnote text-ink-3`}>Your posts will show up here to pin.</Text>
          ) : (
            <ScrollView horizontal {...horizontalScrollProps}>
              <PressableScale
                onPress={() => patch({ pinned_post_id: null })}
                style={tw`w-20 h-20 mr-2 rounded-control border-2 ${draft.pinned_post_id ? 'border-line' : 'border-brand-600'} bg-raised items-center justify-center`}
                accessibilityRole="radio"
                accessibilityState={{ checked: !draft.pinned_post_id }}
                accessibilityLabel="No pinned post"
              >
                <Text style={tw`text-caption font-semibold text-ink-2`}>None</Text>
              </PressableScale>
              {posts.map((p) => {
                const selected = draft.pinned_post_id === p.id;
                const uri = p.image_url ? resolvePostMediaUri(p.image_url, p.category, p.id) : '';
                return (
                  <PressableScale
                    key={p.id}
                    onPress={() => {
                      haptic('selection');
                      patch({ pinned_post_id: p.id });
                    }}
                    style={tw`w-20 h-20 mr-2 rounded-control overflow-hidden border-2 ${selected ? 'border-brand-600' : 'border-line'} bg-raised`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Pin post${p.caption ? `: ${p.caption}` : ''}`}
                  >
                    {uri ? (
                      <GrowImage source={{ uri }} style={tw`w-full h-full`} contentFit="cover" />
                    ) : (
                      <Text style={tw`text-caption text-ink-2 p-1.5`} numberOfLines={4}>
                        {p.caption || 'Post'}
                      </Text>
                    )}
                  </PressableScale>
                );
              })}
            </ScrollView>
          )}
        </Section>

        <Section title="Visit" hint="Where people can find you, and when you’re open.">
          <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>Location</Text>
          <TextInput
            {...formInputAccessoryProps()}
            value={draft.location_label}
            onChangeText={(v) => patch({ location_label: v })}
            maxLength={L.locationLabel}
            placeholder="Luxembourg City, Gare"
            placeholderTextColor={theme.colors.placeholder}
            style={input}
            accessibilityLabel="Location"
          />
          <Text style={tw`text-footnote font-semibold text-ink-2 mb-1 mt-3`}>Pickup note</Text>
          <TextInput
            {...formInputAccessoryProps({ multiline: true })}
            value={draft.pickup_note}
            onChangeText={(v) => patch({ pickup_note: v })}
            maxLength={L.pickupNote}
            multiline
            textAlignVertical="top"
            placeholder="Ring the bell at door 2, weekdays after 10:00."
            placeholderTextColor={theme.colors.placeholder}
            style={[input, tw`min-h-[72px]`]}
            accessibilityLabel="Pickup note"
          />
          <Counter value={draft.pickup_note} max={L.pickupNote} />

          <Text style={tw`text-footnote font-semibold text-ink-2 mb-1 mt-2`}>Opening hours</Text>
          {WEEK_ORDER.map((day) => {
            const h = draft.hours[day];
            return (
              <View key={day} style={tw`flex-row items-center py-1.5`}>
                <Text style={tw`w-12 text-body text-ink`}>{DAY_LABELS[day]}</Text>
                <Switch
                  value={!!h}
                  onValueChange={(v) => {
                    toggleFeedback(v);
                    setDay(day, v ? { open: '09:00', close: '18:00' } : null);
                  }}
                  trackColor={{ false: theme.colors.iconMuted, true: theme.colors.brand }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel={`Open on ${DAY_LABELS[day]}`}
                />
                {h ? (
                  <View style={tw`flex-row items-center flex-1 justify-end`}>
                    <TextInput
                      {...formInputAccessoryProps()}
                      value={h.open}
                      onChangeText={(v) => setDay(day, { ...h, open: v })}
                      maxLength={5}
                      placeholder="09:00"
                      placeholderTextColor={theme.colors.placeholder}
                      keyboardType="numbers-and-punctuation"
                      style={[input, tw`w-20 text-center py-1.5`]}
                      accessibilityLabel={`${DAY_LABELS[day]} opening time`}
                    />
                    <Text style={tw`mx-2 text-ink-3`}>–</Text>
                    <TextInput
                      {...formInputAccessoryProps()}
                      value={h.close}
                      onChangeText={(v) => setDay(day, { ...h, close: v })}
                      maxLength={5}
                      placeholder="18:00"
                      placeholderTextColor={theme.colors.placeholder}
                      keyboardType="numbers-and-punctuation"
                      style={[input, tw`w-20 text-center py-1.5`]}
                      accessibilityLabel={`${DAY_LABELS[day]} closing time`}
                    />
                  </View>
                ) : (
                  <Text style={tw`flex-1 text-right text-footnote text-ink-3`}>Closed</Text>
                )}
              </View>
            );
          })}
        </Section>

        <Section title="Policies" hint="Plain answers to what shoppers ask most.">
          {(
            [
              ['shipping', 'Shipping', 'How and when you ship, and what it costs.', L.shipping],
              ['returns', 'Returns', 'Can people return things? How long do they have?', L.returns],
              ['pickup', 'Pickup', 'Can people collect in person? Where and when?', L.pickup],
            ] as const
          ).map(([key, label, placeholder, max]) => (
            <View key={key} style={tw`mb-2`}>
              <Text style={tw`text-footnote font-semibold text-ink-2 mb-1`}>{label}</Text>
              <TextInput
                {...formInputAccessoryProps({ multiline: true })}
                value={draft[key]}
                onChangeText={(v) => patch({ [key]: v } as Partial<Draft>)}
                maxLength={max}
                multiline
                textAlignVertical="top"
                placeholder={placeholder}
                placeholderTextColor={theme.colors.placeholder}
                style={[input, tw`min-h-[72px]`]}
                accessibilityLabel={`${label} policy`}
              />
              <Counter value={draft[key]} max={max} />
            </View>
          ))}
        </Section>
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          label={saving ? 'Saving…' : dirty ? 'Save storefront' : 'Saved'}
          onPress={() => void save()}
          disabled={saving || !dirty}
          loading={saving}
        />
      </StickyFooter>
      <KeyboardDoneAccessory />

      <StorefrontPreview
        visible={previewOpen}
        onClose={() => setPreviewOpen(false)}
        businessName={businessName}
        logoUrl={logoUrl}
        products={products}
        storefront={current}
        pinnedPost={pinnedPost}
        verified={vStatus === 'verified'}
      />
      <VerificationSheet
        visible={verificationOpen}
        onClose={() => setVerificationOpen(false)}
        state={verification}
        onSubmitted={setVerification}
      />
    </SafeAreaView>
  );
}
