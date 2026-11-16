import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  Platform,
  InputAccessoryView,
  Keyboard,
  Button,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import CATEGORIES from '../../data/categories';
import { uploadMediaFile } from '../../services/api/media';
import StickyFooter from '../ui/StickyFooter';
import { alertMessage, confirmAsync } from '../../utils/confirmDialog';
import { parseLocaleNumber } from '../../utils/money';
import { drafts, localFileExists } from '../../services/drafts';
import { useAuth } from '../../store/hooks';
import { toast } from '../../state/useToastStore';
import { haptic } from '../../theme/haptics';
import {
  EMPTY_PRODUCT_FORM,
  productDraftWorthKeeping,
  productFormDirty,
  validateProductForm,
  type ProductFormValues,
} from '../../services/api/businessHelpers';

const KEYBOARD_ACCESSORY_ID = 'product-form-done';
/** On-device draft for the "Add product" form (one per account). */
const PRODUCT_DRAFT_NS = 'business-product-draft';
const AUTOSAVE_MS = 700;

interface ProductFormProps {
  visible: boolean;
  product?: {
    id: string;
    name: string;
    description?: string;
    category: string;
    subcategory?: string | null;
    price: number;
    stock: number;
    image_url?: string | null;
  } | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    category: string;
    subcategory?: string;
    price: number;
    stock: number;
    image_url?: string;
  }) => Promise<void>;
}

export default function ProductForm({ visible, product, onClose, onSubmit }: ProductFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const priceRef = useRef<TextInput>(null);
  const stockRef = useRef<TextInput>(null);
  const { user } = useAuth();
  const userId = user?.id;
  const isNew = !product;
  /** Values the form opened with; "dirty" = differs from these. */
  const [initial, setInitial] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [ready, setReady] = useState(false);

  const values: ProductFormValues = useMemo(
    () => ({ name, description, category, subcategory, price, stock, imageUrl }),
    [name, description, category, subcategory, price, stock, imageUrl]
  );
  const dirty = productFormDirty(initial, values);

  const applyValues = (v: ProductFormValues) => {
    setName(v.name);
    setDescription(v.description);
    setCategory(v.category);
    setSubcategory(v.subcategory);
    setPrice(v.price);
    setStock(v.stock);
    setImageUrl(v.imageUrl);
  };

  useEffect(() => {
    if (!visible) {
      setReady(false);
      return;
    }
    const start: ProductFormValues = product
      ? {
          name: product.name || '',
          description: product.description || '',
          category: product.category || '',
          subcategory: product.subcategory || '',
          price: product.price?.toString() || '',
          stock: product.stock?.toString() || '',
          imageUrl: product.image_url || '',
        }
      : EMPTY_PRODUCT_FORM;
    applyValues(start);
    setInitial(start);
    setUploadNotice(null);
    setPriceError(null);
    setStockError(null);
    setNameError(null);
    setCategoryError(null);
    setDraftRestored(false);
    if (product) {
      setReady(true);
      return;
    }
    // New product: pick up where the seller left off.
    let alive = true;
    void (async () => {
      const saved = await drafts.load<ProductFormValues>(PRODUCT_DRAFT_NS, userId);
      if (!alive) return;
      if (saved && productDraftWorthKeeping({ ...EMPTY_PRODUCT_FORM, ...saved.data })) {
        const data = { ...EMPTY_PRODUCT_FORM, ...saved.data };
        if (data.imageUrl && !(await localFileExists(data.imageUrl))) data.imageUrl = '';
        if (!alive) return;
        applyValues(data);
        setDraftRestored(true);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, visible, userId]);

  // Autosave the "Add product" form so a call, crash or swipe doesn't lose it.
  useEffect(() => {
    if (!visible || !isNew || !ready) return;
    const t = setTimeout(() => {
      if (productDraftWorthKeeping(values)) void drafts.save(PRODUCT_DRAFT_NS, userId, values);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [values, visible, isNew, ready, userId]);

  const discardDraft = () => {
    void drafts.clear(PRODUCT_DRAFT_NS, userId);
    applyValues(EMPTY_PRODUCT_FORM);
    setDraftRestored(false);
  };

  const requestClose = async () => {
    if (isSubmitting) return;
    if (isNew) {
      if (productDraftWorthKeeping(values)) {
        await drafts.save(PRODUCT_DRAFT_NS, userId, values);
        toast.info('Draft saved — it’ll be here next time');
      }
      onClose();
      return;
    }
    if (dirty) {
      const discard = await confirmAsync('Discard changes?', 'Your edits to this product haven’t been saved.', {
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!discard) return;
    }
    onClose();
  };

  const selectedCategoryData = CATEGORIES.find((c) => c.key === category);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Camera roll access is required for product images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.72,
      exif: false,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
      setUploadNotice(null);
    }
  };

  const handleSubmit = async () => {
    // Accept "12,50" as well as "12.50".
    const errors = validateProductForm(values);
    setNameError(errors.name ?? null);
    setCategoryError(errors.category ?? null);
    setPriceError(errors.price ?? null);
    setStockError(errors.stock ?? null);
    const parsedPrice = parseLocaleNumber(price);
    const parsedStock = parseLocaleNumber(stock);
    if (Object.keys(errors).length > 0 || parsedPrice == null || parsedStock == null) {
      haptic('error');
      return;
    }

    setIsSubmitting(true);
    setUploadNotice(null);
    try {
      let persistableImageUrl = imageUrl || undefined;
      const lower = (persistableImageUrl || '').toLowerCase();
      const needsUpload =
        !!persistableImageUrl &&
        !lower.startsWith('http://') &&
        !lower.startsWith('https://');

      if (needsUpload && persistableImageUrl) {
        try {
          const uploaded = await uploadMediaFile(persistableImageUrl, 'product');
          persistableImageUrl = uploaded.url;
        } catch (uploadErr: unknown) {
          const msg =
            uploadErr instanceof Error ? uploadErr.message : 'Image upload failed';
          const saveWithout = await confirmAsync(
            'Image upload failed',
            `${msg}\n\nSave this product without an image?`,
            { confirmLabel: 'Save without image' }
          );
          if (!saveWithout) {
            setUploadNotice('Fix media storage (R2) or try another image.');
            setIsSubmitting(false);
            return;
          }
          setUploadNotice('Saved without hosted image.');
          persistableImageUrl = undefined;
        }
      }

      // On edit, '' clears the field server-side (undefined = "leave unchanged"), so
      // removing the image / description / subcategory actually sticks.
      const cleared = isNew ? undefined : '';
      await onSubmit({
        name: name.trim(),
        description: description.trim() || cleared,
        category,
        subcategory: subcategory || cleared,
        price: Math.round(parsedPrice * 100) / 100,
        stock: parsedStock,
        image_url: persistableImageUrl ?? (!imageUrl ? cleared : undefined),
      });
      if (isNew) void drafts.clear(PRODUCT_DRAFT_NS, userId);
      onClose();
    } catch (error: unknown) {
      alertMessage(
        'Error',
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Failed to save product'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = tw`bg-card border border-line rounded-control px-4 py-3 text-base text-ink`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => void requestClose()}
    >
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line/80 bg-card`}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={isNew ? 'Close and keep draft' : 'Close'}
            onPress={() => void requestClose()}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color={theme.colors.ink3} />
          </PressableScale>
          <Text style={tw`text-lg font-semibold text-ink`} accessibilityRole="header">
            {product ? 'Edit product' : 'Add product'}
          </Text>
          <PressableScale
            onPress={() => Keyboard.dismiss()}
            hitSlop={12}
            accessibilityLabel="Dismiss keyboard"
          >
            <Text style={tw`text-sm font-semibold text-emerald-700`}>Done</Text>
          </PressableScale>
        </View>

        {/* iOS: the ScrollView insets itself (automaticallyAdjustKeyboardInsets, screen coords).
            KeyboardAvoidingView used its local frame and under-shot by the view's offset from
            the window top. Android: window resizes (softwareKeyboardLayoutMode resize). */}
        <View style={tw`flex-1`}>
          <ScrollView
            style={tw`flex-1 px-gutter pt-4`}
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={tw`pb-6`}
          >
            {draftRestored ? (
              <View style={tw`flex-row items-center bg-raised border border-line rounded-control px-3 py-2.5 mb-4`}>
                <Ionicons name="document-text-outline" size={16} color={theme.colors.ink3} />
                <Text style={tw`flex-1 text-footnote text-ink-2 ml-2`}>Picked up your unsaved draft.</Text>
                <PressableScale onPress={discardDraft} hitSlop={8} accessibilityRole="button" accessibilityLabel="Discard draft and start over">
                  <Text style={tw`text-footnote font-semibold text-red-600`}>Start over</Text>
                </PressableScale>
              </View>
            ) : null}
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Product image</Text>
              {imageUrl ? (
                <View style={tw`relative`}>
                  <Image source={{ uri: imageUrl }} style={tw`w-full h-48 rounded-control`} contentFit="cover" />
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel="Remove image"
                    hitSlop={6}
                    style={tw`absolute top-2 right-2 bg-red-500 rounded-chip p-2`}
                    onPress={() => setImageUrl('')}
                  >
                    <Ionicons name="close" size={18} color="#FFFFFF" />
                  </PressableScale>
                </View>
              ) : (
                <PressableScale
                  style={tw`w-full h-40 bg-card rounded-control items-center justify-center border-2 border-dashed border-line`}
                  onPress={() => void handlePickImage()}
                  accessibilityRole="button"
                  accessibilityLabel="Add product photo"
                >
                  <Ionicons name="image-outline" size={40} color={theme.colors.iconMuted} />
                  <Text style={tw`text-ink-3 mt-2`}>Tap to add image</Text>
                </PressableScale>
              )}
              {uploadNotice ? <Text style={tw`text-xs text-amber-700 mt-2`}>{uploadNotice}</Text> : null}
            </View>

            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Name *</Text>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (nameError) setNameError(null);
                }}
                placeholder="Product name"
                maxLength={120}
                accessibilityLabel="Product name, required"
                style={[inputStyle, nameError ? tw`border-red-500` : null]}
                placeholderTextColor={theme.colors.ink3}
                inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => priceRef.current?.focus()}
              />
              {nameError ? <Text style={tw`text-xs text-red-600 mt-1`}>{nameError}</Text> : null}
            </View>

            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                multiline
                style={[inputStyle, tw`min-h-24 max-h-48`]}
                placeholderTextColor={theme.colors.ink3}
                textAlignVertical="top"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
                inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
              />
            </View>

            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Category *</Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {CATEGORIES.map((cat) => (
                  <PressableScale
                    key={cat.key}
                    onPress={() => {
                      setCategory(cat.key);
                      setSubcategory('');
                      if (categoryError) setCategoryError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === cat.key }}
                    style={tw`px-3 py-2 rounded-chip ${category === cat.key ? 'bg-emerald-600' : 'bg-card border border-line'}`}
                  >
                    <Text style={tw`text-sm font-semibold ${category === cat.key ? 'text-white' : 'text-ink-2'}`}>
                      {cat.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
              {categoryError ? <Text style={tw`text-xs text-red-600 mt-1`}>{categoryError}</Text> : null}
            </View>

            {selectedCategoryData?.subcategories?.length ? (
              <View style={tw`mb-4`}>
                <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Subcategory</Text>
                <View style={tw`flex-row flex-wrap gap-2`}>
                  {selectedCategoryData.subcategories.map((sub) => (
                    <PressableScale
                      key={sub.key}
                      onPress={() => setSubcategory(sub.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: subcategory === sub.key }}
                      style={tw`px-3 py-2 rounded-chip ${
                        subcategory === sub.key ? 'bg-emerald-600' : 'bg-card border border-line'
                      }`}
                    >
                      <Text
                        style={tw`text-sm font-semibold ${
                          subcategory === sub.key ? 'text-white' : 'text-ink-2'
                        }`}
                      >
                        {sub.label}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={tw`flex-row gap-3 mb-8`}>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Price (€) *</Text>
                <TextInput
                  ref={priceRef}
                  value={price}
                  onChangeText={(v) => {
                    setPrice(v);
                    if (priceError) setPriceError(null);
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  accessibilityLabel="Price in euro, required"
                  style={[inputStyle, priceError ? tw`border-red-500` : null]}
                  placeholderTextColor={theme.colors.ink3}
                  returnKeyType="done"
                  inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
                  onSubmitEditing={() => stockRef.current?.focus()}
                />
                {priceError ? (
                  <Text style={tw`text-xs text-red-600 mt-1`}>{priceError}</Text>
                ) : null}
              </View>
              <View style={tw`flex-1`}>
                <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Stock *</Text>
                <TextInput
                  ref={stockRef}
                  value={stock}
                  onChangeText={(v) => {
                    setStock(v);
                    if (stockError) setStockError(null);
                  }}
                  placeholder="0"
                  keyboardType="number-pad"
                  accessibilityLabel="Stock, required"
                  style={[inputStyle, stockError ? tw`border-red-500` : null]}
                  placeholderTextColor={theme.colors.ink3}
                  returnKeyType="done"
                  inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                {stockError ? (
                  <Text style={tw`text-xs text-red-600 mt-1`}>{stockError}</Text>
                ) : null}
              </View>
            </View>
          </ScrollView>

          <StickyFooter style={tw`bg-card border-line/80`}>
            <PressableScale
              style={tw`bg-emerald-600 rounded-control py-4 items-center ${isSubmitting ? 'opacity-50' : ''}`}
              onPress={() => void handleSubmit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            >
              <Text style={tw`text-white font-bold text-base`}>
                {isSubmitting ? 'Saving…' : product ? 'Save changes' : 'Create product'}
              </Text>
            </PressableScale>
          </StickyFooter>
        </View>

        {Platform.OS === 'ios' ? (
          <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
            <View
              style={tw`bg-raised border-t border-line px-3 py-2 flex-row justify-end`}
            >
              <Button title="Done" onPress={() => Keyboard.dismiss()} color={theme.colors.brand} />
            </View>
          </InputAccessoryView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
