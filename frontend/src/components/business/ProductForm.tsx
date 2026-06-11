import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import tw from '../../lib/tw';
import CATEGORIES from '../../data/categories';
import { uploadMediaApi } from '../../services/api/media';

interface ProductFormProps {
  visible: boolean;
  product?: {
    id: string;
    name: string;
    description?: string;
    category: string;
    subcategory?: string;
    price: number;
    stock: number;
    image_url?: string;
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
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [category, setCategory] = useState(product?.category || '');
  const [subcategory, setSubcategory] = useState(product?.subcategory || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [stock, setStock] = useState(product?.stock?.toString() || '');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    setName(product?.name || '');
    setDescription(product?.description || '');
    setCategory(product?.category || '');
    setSubcategory(product?.subcategory || '');
    setPrice(product?.price?.toString() || '');
    setStock(product?.stock?.toString() || '');
    setImageUrl(product?.image_url || '');
  }, [product, visible]);

  const blobToOptimizedDataUrl = async (uri: string): Promise<string> => {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read selected image'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to add product images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUrl(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Product name is required');
      return;
    }
    if (!category) {
      Alert.alert('Validation Error', 'Please select a category');
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid price');
      return;
    }
    if (!stock || parseInt(stock) < 0) {
      Alert.alert('Validation Error', 'Please enter a valid stock quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      let persistableImageUrl = imageUrl || undefined;
      const lower = (persistableImageUrl || '').toLowerCase();
      if (persistableImageUrl && !lower.startsWith('http')) {
        let dataUrl = persistableImageUrl;
        if (Platform.OS === 'web' && lower.startsWith('blob:')) {
          dataUrl = await blobToOptimizedDataUrl(persistableImageUrl);
        }
        if (dataUrl.toLowerCase().startsWith('data:')) {
          persistableImageUrl = await uploadMediaApi(dataUrl, 'product');
        }
      }
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        subcategory: subcategory.trim() || undefined,
        price: parseFloat(price),
        stock: parseInt(stock),
        image_url: persistableImageUrl,
      });
      // Reset form
      setName('');
      setDescription('');
      setCategory('');
      setSubcategory('');
      setPrice('');
      setStock('');
      setImageUrl('');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCategoryData = CATEGORIES.find((c) => c.id === category);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={tw`flex-1 bg-white`}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200`}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#6B7280" />
          </TouchableOpacity>
          <Text style={tw`text-lg font-semibold text-gray-900`}>
            {product ? 'Edit Product' : 'Add New Product'}
          </Text>
          <View style={tw`w-7`} />
        </View>

        <ScrollView style={tw`flex-1 px-4 pt-4`} showsVerticalScrollIndicator={false}>
          {/* Image */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Product Image</Text>
            {imageUrl ? (
              <View style={tw`relative`}>
                <Image source={{ uri: imageUrl }} style={tw`w-full h-48 rounded-lg`} contentFit="cover" />
                <TouchableOpacity
                  style={tw`absolute top-2 right-2 bg-red-500 rounded-full p-2`}
                  onPress={() => setImageUrl('')}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={tw`w-full h-48 bg-gray-100 rounded-lg items-center justify-center border-2 border-dashed border-gray-300`}
                onPress={handlePickImage}
              >
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                <Text style={tw`text-gray-500 mt-2`}>Tap to add image</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Name */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Product Name *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter product name"
              style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base`}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Description */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Enter product description"
              multiline
              numberOfLines={4}
              style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base min-h-24`}
              placeholderTextColor="#9CA3AF"
              textAlignVertical="top"
            />
          </View>

          {/* Category */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Category *</Text>
            <TouchableOpacity
              style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex-row items-center justify-between`}
              onPress={() => setShowCategoryPicker(!showCategoryPicker)}
            >
              <Text style={tw`text-base ${category ? 'text-gray-900' : 'text-gray-400'}`}>
                {selectedCategoryData?.name || 'Select category'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>
            {showCategoryPicker && (
              <View style={tw`mt-2 bg-white border border-gray-200 rounded-lg max-h-48`}>
                <ScrollView nestedScrollEnabled>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={tw`px-4 py-3 border-b border-gray-100 ${
                        category === cat.id ? 'bg-blue-50' : ''
                      }`}
                      onPress={() => {
                        setCategory(cat.id);
                        setShowCategoryPicker(false);
                      }}
                    >
                      <Text style={tw`text-base ${category === cat.id ? 'text-blue-600 font-semibold' : 'text-gray-900'}`}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Subcategory */}
          {selectedCategoryData?.subcategories && selectedCategoryData.subcategories.length > 0 && (
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Subcategory</Text>
              <TextInput
                value={subcategory}
                onChangeText={setSubcategory}
                placeholder="Enter subcategory (optional)"
                style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base`}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          )}

          {/* Price and Stock */}
          <View style={tw`flex-row gap-3 mb-4`}>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Price ($) *</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base`}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={tw`flex-1`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Stock *</Text>
              <TextInput
                value={stock}
                onChangeText={setStock}
                placeholder="0"
                keyboardType="number-pad"
                style={tw`bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base`}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={tw`bg-blue-600 rounded-xl py-4 items-center justify-center mb-6 ${
              isSubmitting ? 'opacity-50' : ''
            }`}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={tw`text-white font-bold text-base`}>
              {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
