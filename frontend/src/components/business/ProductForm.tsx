import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  Platform,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
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

const KEYBOARD_ACCESSORY_ID = 'product-form-done';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const priceRef = useRef<TextInput>(null);
  const stockRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setName(product?.name || '');
    setDescription(product?.description || '');
    setCategory(product?.category || '');
    setSubcategory(product?.subcategory || '');
    setPrice(product?.price?.toString() || '');
    setStock(product?.stock?.toString() || '');
    setImageUrl(product?.image_url || '');
    setUploadNotice(null);
    setPriceError(null);
    setStockError(null);
  }, [product, visible]);

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
    if (!name.trim()) {
      alertMessage('Missing name', 'Product name is required');
      return;
    }
    if (!category) {
      alertMessage('Missing category', 'Select a category');
      return;
    }
    // Accept "12,50" as well as "12.50".
    const parsedPrice = parseLocaleNumber(price);
    const parsedStock = parseLocaleNumber(stock);
    const nextPriceError =
      parsedPrice == null || parsedPrice <= 0 ? 'Enter a price above 0, e.g. 12,50' : null;
    const nextStockError =
      parsedStock == null || parsedStock < 0 || !Number.isInteger(parsedStock)
        ? 'Enter a whole number of 0 or more'
        : null;
    setPriceError(nextPriceError);
    setStockError(nextStockError);
    if (nextPriceError || nextStockError || parsedPrice == null || parsedStock == null) {
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

      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        subcategory: subcategory || undefined,
        price: Math.round(parsedPrice * 100) / 100,
        stock: parsedStock,
        image_url: persistableImageUrl,
      });
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={tw`flex-1 bg-page`} edges={['top', 'bottom']}>
        <View style={tw`flex-row items-center justify-between px-gutter py-3 border-b border-line/80 bg-card`}>
          <PressableScale onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={theme.colors.ink3} />
          </PressableScale>
          <Text style={tw`text-lg font-semibold text-ink`}>
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

        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={tw`flex-1 px-gutter pt-4`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={tw`pb-6`}
          >
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Product image</Text>
              {imageUrl ? (
                <View style={tw`relative`}>
                  <Image source={{ uri: imageUrl }} style={tw`w-full h-48 rounded-control`} contentFit="cover" />
                  <PressableScale
                    style={tw`absolute top-2 right-2 bg-red-500 rounded-chip p-2`}
                    onPress={() => setImageUrl('')}
                  >
                    <Ionicons name="close" size={18} color="#FFFFFF" />
                  </PressableScale>
                </View>
              ) : (
                <PressableScale
                  style={tw`w-full h-40 bg-card rounded-control items-center justify-center border-2 border-dashed border-stone-300`}
                  onPress={() => void handlePickImage()}
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
                onChangeText={setName}
                placeholder="Product name"
                style={inputStyle}
                placeholderTextColor={theme.colors.ink3}
                inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => priceRef.current?.focus()}
              />
            </View>

            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                multiline
                style={[inputStyle, tw`min-h-24`]}
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
                    }}
                    style={tw`px-3 py-2 rounded-chip ${category === cat.key ? 'bg-emerald-600' : 'bg-card border border-line'}`}
                  >
                    <Text style={tw`text-sm font-semibold ${category === cat.key ? 'text-white' : 'text-ink-2'}`}>
                      {cat.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {selectedCategoryData?.subcategories?.length ? (
              <View style={tw`mb-4`}>
                <Text style={tw`text-sm font-semibold text-ink-2 mb-2`}>Subcategory</Text>
                <View style={tw`flex-row flex-wrap gap-2`}>
                  {selectedCategoryData.subcategories.map((sub) => (
                    <PressableScale
                      key={sub.key}
                      onPress={() => setSubcategory(sub.key)}
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
                  style={inputStyle}
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
                  style={inputStyle}
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
            >
              <Text style={tw`text-white font-bold text-base`}>
                {isSubmitting ? 'Saving…' : product ? 'Save changes' : 'Create product'}
              </Text>
            </PressableScale>
          </StickyFooter>
        </KeyboardAvoidingView>

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
