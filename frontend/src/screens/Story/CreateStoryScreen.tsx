import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { createStory } from '../../services/api/stories';
import { uploadMediaApi } from '../../services/api/media';
import PrimaryButton from '../../components/ui/PrimaryButton';
import tw from '../../lib/tw';

type CreateStoryNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CreateStory'>;

type Props = {
  navigation: CreateStoryNavigationProp;
};

export default function CreateStoryScreen({ navigation }: Props) {
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const blobToOptimizedDataUrl = async (uri: string): Promise<string> => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return uri;
    const res = await fetch(uri);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const imageEl = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Could not decode selected image'));
        img.src = objectUrl;
      });

      const maxDim = 1400;
      const scale = Math.min(1, maxDim / Math.max(imageEl.width, imageEl.height));
      const width = Math.max(1, Math.round(imageEl.width * scale));
      const height = Math.max(1, Math.round(imageEl.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return uri;
      ctx.drawImage(imageEl, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow library access to publish a story.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to capture a story.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const showPicker = () => {
    Alert.alert('Create story', 'Choose an image source', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const publishStory = async () => {
    if (!image || posting) return;
    setPosting(true);
    try {
      let persistable = image;
      if (Platform.OS === 'web' && image.toLowerCase().startsWith('blob:')) {
        try {
          persistable = await blobToOptimizedDataUrl(image);
        } catch (err) {
          console.warn('[CreateStoryScreen] blob conversion failed, using original URI', err);
        }
      }

      let imageUrl = persistable;
      if (persistable.toLowerCase().startsWith('data:')) {
        try {
          imageUrl = await uploadMediaApi(persistable, 'story');
        } catch {
          imageUrl = persistable;
        }
      }

      await createStory({
        image_url: imageUrl,
        caption: caption.trim() || undefined,
      });

      if (Platform.OS === 'web') {
        alert('Story published.');
      } else {
        Alert.alert('Story published', 'Your story is now live.');
      }
      navigation.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish story';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-row items-center justify-between px-4 py-3 border-b border-stone-200`}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#6B7280" />
        </TouchableOpacity>
        <Text style={tw`text-xl font-bold text-stone-900`}>Create Story</Text>
        <View style={tw`w-7`} />
      </View>

      <ScrollView style={tw`flex-1`} contentContainerStyle={tw`p-4`}>
        {image ? (
          <View style={tw`relative mb-4`}>
            <Image source={{ uri: image }} style={tw`w-full h-96 rounded-2xl`} contentFit="cover" />
            <TouchableOpacity
              style={tw`absolute top-3 right-3 bg-black/40 rounded-full p-2`}
              onPress={() => setImage(null)}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={showPicker}
            style={tw`w-full h-96 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 items-center justify-center mb-4`}
          >
            <Ionicons name="camera" size={44} color="#10B981" />
            <Text style={tw`text-stone-700 font-semibold mt-2`}>Add story image</Text>
            <Text style={tw`text-stone-500 text-sm mt-1`}>Tap to pick or capture</Text>
          </TouchableOpacity>
        )}

        <Text style={tw`text-sm font-semibold text-stone-700 mb-2`}>Caption (optional)</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Say something about this story..."
          placeholderTextColor="#A8A29E"
          multiline
          maxLength={180}
          style={tw`bg-stone-100 rounded-xl p-4 min-h-24 text-stone-800`}
        />
        <Text style={tw`text-xs text-stone-400 mt-2 mb-4`}>{caption.length}/180</Text>

        <PrimaryButton label={posting ? 'Publishing...' : 'Publish Story'} onPress={publishStory} disabled={!image || posting} />
      </ScrollView>
    </SafeAreaView>
  );
}
