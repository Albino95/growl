import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import PrimaryButton from '../../components/ui/PrimaryButton';
import PhotoEditor from '../../components/ui/PhotoEditor';
import { useAuthStore } from '../../state/useAuthStore';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import CATEGORIES from '../../data/categories';
import tw from '../../lib/tw';

type PostScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Post'>;

interface PostScreenProps {
  navigation: PostScreenNavigationProp;
}

export default function PostScreen({ navigation }: PostScreenProps) {
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const captionInputRef = useRef<TextInput>(null);
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
      allowsEditing: false,
      quality: 0.9,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setShowEditor(true);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'We need camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      setShowEditor(true);
    }
  };

  const showImagePicker = () => {
    Alert.alert(
      'Add Photo',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleEditPhoto = () => {
    if (image) {
      setShowEditor(true);
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert(
      'Remove Photo',
      'Are you sure you want to remove this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setImage(null);
            setCaption('');
          },
        },
      ]
    );
  };

  const handlePost = async () => {
    console.log('handlePost called', { image: !!image, selectedCategory, isPosting });
    
    if (!image) {
      Alert.alert('Image required', 'Please select an image to post.');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Category required', 'Please select a category for your post.');
      return;
    }

    if (isPosting) {
      return; // Prevent double posting
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
            setImage(null);
            setCaption('');
            setSelectedCategory(null);
            setIsPosting(false);
            navigation?.goBack();
          },
        },
      ]);
    } catch (error) {
      console.error('Post error:', error);
      Alert.alert('Error', 'Failed to post. Please try again.');
      setIsPosting(false);
    }
  };

  if (showEditor && image) {
    return (
      <PhotoEditor
        imageUri={image}
        onSave={(editedUri) => {
          setImage(editedUri);
          setShowEditor(false);
        }}
        onCancel={() => setShowEditor(false)}
      />
    );
  }

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

        <ScrollView style={tw`flex-1`} showsVerticalScrollIndicator={false}>
          <View style={tw`p-4`}>
            {/* Image Preview/Selector */}
            <View style={tw`mb-4`}>
              {image ? (
                <View style={tw`relative`}>
                  <Image
                    source={{ uri: image }}
                    style={tw`w-full h-80 rounded-xl`}
                    contentFit="cover"
                    transition={200}
                  />
                  {/* Image Actions */}
                  <View style={tw`absolute top-3 right-3 flex-row gap-2`}>
                    <TouchableOpacity
                      onPress={handleEditPhoto}
                      style={tw`bg-black bg-opacity-50 rounded-full p-2`}
                    >
                      <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleRemovePhoto}
                      style={tw`bg-black bg-opacity-50 rounded-full p-2`}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={showImagePicker}
                  style={tw`w-full h-64 bg-gray-100 rounded-xl items-center justify-center border-2 border-dashed border-gray-300`}
                >
                  <View style={tw`items-center`}>
                    <View style={tw`bg-green-100 rounded-full p-4 mb-3`}>
                      <Ionicons name="camera" size={40} color="#10B981" />
                    </View>
                    <Text style={tw`text-gray-700 font-semibold text-base mb-1`}>Add Photo</Text>
                    <Text style={tw`text-gray-500 text-sm`}>Take a photo or choose from library</Text>
                  </View>
                </TouchableOpacity>
              )}
              
              {/* Quick Action Buttons */}
              {!image && (
                <View style={tw`flex-row gap-3 mt-3`}>
                  <TouchableOpacity
                    onPress={takePhoto}
                    style={tw`flex-1 flex-row items-center justify-center bg-green-600 rounded-xl py-3 px-4`}
                  >
                    <Ionicons name="camera" size={20} color="#FFFFFF" style={tw`mr-2`} />
                    <Text style={tw`text-white font-semibold`}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={pickImage}
                    style={tw`flex-1 flex-row items-center justify-center bg-gray-200 rounded-xl py-3 px-4`}
                  >
                    <Ionicons name="images" size={20} color="#374151" style={tw`mr-2`} />
                    <Text style={tw`text-gray-700 font-semibold`}>Library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Caption */}
            <View style={tw`mb-4`}>
              <Text style={tw`text-sm font-semibold text-gray-700 mb-2`}>Caption</Text>
              <TextInput
                ref={captionInputRef}
                placeholder="Write a caption..."
                multiline
                value={caption}
                onChangeText={setCaption}
                style={tw`border border-gray-300 rounded-xl p-4 text-base min-h-24 bg-gray-50`}
                placeholderTextColor="#9CA3AF"
                maxLength={500}
                returnKeyType="default"
                textAlignVertical="top"
                blurOnSubmit={false}
              />
              <View style={tw`flex-row justify-between items-center mt-2`}>
                <Text style={tw`text-xs text-gray-400`}>
                  {caption.length}/500
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    captionInputRef.current?.blur();
                    Keyboard.dismiss();
                  }}
                  style={tw`px-4 py-1.5 bg-green-100 rounded-full`}
                >
                  <Text style={tw`text-xs text-green-700 font-semibold`}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Category Selector */}
            {userCategories.length > 0 && (
              <View style={tw`mb-4`}>
                <Text style={tw`text-sm font-semibold text-gray-700 mb-3`}>Select Category</Text>
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
            )}

            {/* Post Button */}
            <View style={tw`mt-4 mb-6`}>
              <PrimaryButton
                label={isPosting ? 'Posting...' : 'Post'}
                onPress={handlePost}
                disabled={!image || !selectedCategory || isPosting}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

