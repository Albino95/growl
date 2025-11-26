import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useAuthStore } from '../../state/useAuthStore';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';

export default function PostScreen({ navigation }: any) {
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const { user, updateUser } = useAuthStore();

  const userCategories = user?.categories || [];

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera roll permissions to post images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const showImagePicker = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handlePost = async () => {
    if (!image) {
      Alert.alert('Image required', 'Please select an image to post.');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Category required', 'Please select a category for your post.');
      return;
    }

    setIsPosting(true);
    try {
      // In real app, upload image and create post via API
      // For now, just simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Award points for posting
      const currentPoints = user?.points || 0;
      updateUser({ points: currentPoints + 10 });

      Alert.alert('Success', 'Your post has been shared!', [
        {
          text: 'OK',
          onPress: () => {
            navigation?.goBack();
            setImage(null);
            setCaption('');
            setSelectedCategory(null);
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to post. Please try again.');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1`}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-gray-200`}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Ionicons name="close" size={28} color="#6B7280" />
          </TouchableOpacity>
          <Text style={tw`text-xl font-bold text-gray-900`}>Create Post</Text>
          <View style={tw`w-7`} />
        </View>

        <View style={tw`flex-1 p-4`}>
          {/* Image Preview/Selector */}
          <TouchableOpacity
            onPress={showImagePicker}
            style={tw`w-full h-64 bg-gray-100 rounded-xl items-center justify-center mb-4 border-2 border-dashed border-gray-300`}
          >
            {image ? (
              <Image source={{ uri: image }} style={tw`w-full h-full rounded-xl`} resizeMode="cover" />
            ) : (
              <View style={tw`items-center`}>
                <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                <Text style={tw`text-gray-500 mt-2`}>Tap to select image</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Caption */}
          <TextInput
            placeholder="Write a caption..."
            multiline
            value={caption}
            onChangeText={setCaption}
            style={tw`border border-gray-300 rounded-xl p-3 text-base mb-4 min-h-24`}
            placeholderTextColor="#9CA3AF"
          />

          {/* Category Selector */}
          <View style={tw`mb-4`}>
            <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Select Category</Text>
            <View style={tw`flex-row flex-wrap`}>
              {userCategories.map((cat) => {
                const category = CATEGORIES.find((c) => c.key === cat || c.key === cat.split(':')[0]);
                const subcategory = cat.includes(':')
                  ? category?.subcategories.find((s) => s.key === cat.split(':')[1])
                  : null;
                const label = subcategory ? subcategory.label : category?.label || cat;

                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={tw`px-4 py-2 rounded-full mr-2 mb-2 ${
                      selectedCategory === cat ? 'bg-green-600' : 'bg-gray-100'
                    }`}
                  >
                    <Text
                      style={tw`text-sm font-medium ${
                        selectedCategory === cat ? 'text-white' : 'text-gray-700'
                      }`}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Post Button */}
          <PrimaryButton
            label={isPosting ? 'Posting...' : 'Post'}
            onPress={handlePost}
            disabled={!image || !selectedCategory || isPosting}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

