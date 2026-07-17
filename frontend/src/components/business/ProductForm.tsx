import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Platform } from 'react-native';
import tw from '../../lib/tw';
import CATEGORIES from '../../data/categories';
import { uploadMediaApi } from '../../services/api/media';
import StickyFooter from '../ui/StickyFooter';
import { alertMessage } from '../../utils/confirmDialog';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

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
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
      setUploadNotice(null);
    }
  };

  const blobToDataUrl = async (uri: string): Promise<string> => {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
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
    if (!price || parseFloat(price) <= 0) {
      alertMessage('Invalid price', 'Enter a valid price');
      return;
    }
    if (stock === '' || parseInt(stock, 10) < 0) {
      alertMessage('Invalid stock', 'Enter a valid stock quantity');
      return;
    }

    setIsSubmitting(true);
    setUploadNotice(null);
    try {
      let persistableImageUrl = imageUrl || undefined;
      const lower = (persistableImageUrl || '').toLowerCase();
      if (persistableImageUrl && !lower.startsWith('http')) {
        let dataUrl = persistableImageUrl;
        if (Platform.OS === 'web' && lower.startsWith('blob:')) {
          dataUrl = await blobToDataUrl(persistableImageUrl);
        }
        if (dataUrl.toLowerCase().startsWith('data:')) {
          try {
            persistableImageUrl = await uploadMediaApi(dataUrl, 'product');
          } catch {
            setUploadNotice('Image upload unavailable (media storage offline). Saving product without hosted image.');
            persistableImageUrl = undefined;
          }
        }
      }
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        subcategory: subcategory || undefined,
        price: parseFloat(price),
        stock: parseInt(stock, 10),
        image_url: persistableImageUrl,
      });
      onClose();
    } catch (error: unknown) {
      alertMessage('Error', error instanceof Error ? error.message : 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={tw`flex-1 bg-white`}>
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-200`}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color="#78716C" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-stone-900`}>
            {product ? 'Edit product' : 'Add product'}
          </Text>
          <View style={tw`w-7`} />
        </View>

        <ScrollView style={tw`flex-1 px-4 pt-4`} keyboardShouldPersistTaps="handled">
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Product image</Text>
            {imageUrl ? (
              <View style={tw`relative`}>
                <Image source={{ uri: imageUrl }} style={tw`w-full h-48 rounded-xl`} contentFit="cover" />
                <TouchableOpacity
                  style={tw`absolute top-2 right-2 bg-red-500 rounded-full p-2`}
                  onPress={() => setImageUrl('')}
                >
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={tw`w-full h-40 bg-stone-50 rounded-xl items-center justify-center border-2 border-dashed border-stone-300`}
                onPress={() => void handlePickImage()}
              >
                <Ionicons name="image-outline" size={40} color="#A8A29E" />
                <Text style={tw`text-stone-500 mt-2`}>Tap to add image</Text>
              </TouchableOpacity>
            )}
            {uploadNotice ? <Text style={tw`text-xs text-amber-700 mt-2`}>{uploadNotice}</Text> : null}
          </View>

          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Product name"
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-base`}
              placeholderTextColor="#A8A29E"
            />
          </View>

          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              multiline
              style={tw`bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-base min-h-24`}
              placeholderTextColor="#A8A29E"
              textAlignVertical="top"
            />
          </View>

          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Category *</Text>
            <View style={tw`flex-row flex-wrap gap-2`}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => {
                    setCategory(cat.key);
                    setSubcategory('');
                  }}
                  style={tw`px-3 py-2 rounded-full ${category === cat.key ? 'bg-emerald-600' : 'bg-stone-100'}`}
                >
                  <Text style={tw`text-sm font-semibold ${category === cat.key ? 'text-white' : 'text-stone-700'}`}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {selectedCategoryData?.subcategories?.length ? (
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Subcategory</Text>
              <View style={tw`flex-row flex-wrap gap-2`}>
                {selectedCategoryData.subcategories.map((sub) => (
                  <TouchableOpacity
                    key={sub.key}
                    onPress={() => setSubcategory(sub.key)}
                    style={tw`px-3 py-2 rounded-full ${
                      subcategory === sub.key ? 'bg-emerald-600' : 'bg-stone-100'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-semibold ${
                        subcategory === sub.key ? 'text-white' : 'text-stone-700'
                      }`}
                    >
                      {sub.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          <View style={tw`flex-row gap-3 mb-8`}>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Price ($) *</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={tw`bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-base`}
                placeholderTextColor="#A8A29E"
              />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Stock *</Text>
              <TextInput
                value={stock}
                onChangeText={setStock}
                placeholder="0"
                keyboardType="number-pad"
                style={tw`bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-base`}
                placeholderTextColor="#A8A29E"
              />
            </View>
          </View>
        </ScrollView>

        <StickyFooter>
          <TouchableOpacity
            style={tw`bg-emerald-600 rounded-xl py-4 items-center ${isSubmitting ? 'opacity-50' : ''}`}
            onPress={() => void handleSubmit()}
            disabled={isSubmitting}
          >
            <Text style={tw`text-white font-bold text-base`}>
              {isSubmitting ? 'Saving…' : product ? 'Save changes' : 'Create product'}
            </Text>
          </TouchableOpacity>
        </StickyFooter>
      </SafeAreaView>
    </Modal>
  );
}
