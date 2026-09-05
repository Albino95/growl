import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { createStory } from '../../services/api/stories';
import { uploadMediaApi } from '../../services/api/media';
import { isRemoteMediaUrl, uriToDataUrl } from '../../utils/mediaUri';
import { alertMessage } from '../../utils/confirmDialog';
import PhotoEditor from '../../components/ui/PhotoEditor';
import tw from '../../lib/tw';

type CreateStoryNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CreateStory'>;

type Props = {
  navigation: CreateStoryNavigationProp;
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CreateStoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [openingCamera, setOpeningCamera] = useState(true);
  const cameraBooted = useRef(false);

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

  const applyPickedUri = useCallback((uri: string) => {
    setImage(uri);
    setShowEditor(true);
    setOpeningCamera(false);
  }, []);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'Allow library access to publish a story.');
      setOpeningCamera(false);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      applyPickedUri(result.assets[0].uri);
    } else {
      setOpeningCamera(false);
    }
  }, [applyPickedUri]);

  const takePhoto = useCallback(async () => {
    setOpeningCamera(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        alertMessage('Permission needed', 'Allow camera access to capture a story.');
        setOpeningCamera(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        applyPickedUri(result.assets[0].uri);
      } else {
        setOpeningCamera(false);
      }
    } catch {
      setOpeningCamera(false);
      alertMessage('Camera unavailable', 'Use your gallery instead, or try again.');
    }
  }, [applyPickedUri]);

  useEffect(() => {
    if (cameraBooted.current) return;
    cameraBooted.current = true;
    void takePhoto();
  }, [takePhoto]);

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
      if (!isRemoteMediaUrl(persistable)) {
        try {
          const dataUrl = persistable.toLowerCase().startsWith('data:')
            ? persistable
            : await uriToDataUrl(persistable);
          imageUrl = await uploadMediaApi(dataUrl, 'story');
        } catch (uploadErr: unknown) {
          const msg =
            uploadErr instanceof Error ? uploadErr.message : 'Image upload failed';
          alertMessage('Image upload failed', msg);
          return;
        }
      }

      await createStory({
        image_url: imageUrl,
        caption: caption.trim() || undefined,
      });

      alertMessage('Story published', 'Your story is now live.');
      navigation.goBack();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish story';
      alertMessage('Error', msg);
    } finally {
      setPosting(false);
    }
  };

  if (showEditor && image) {
    return (
      <PhotoEditor
        imageUri={image}
        title="Your story"
        preferredAspect="9:16"
        enableOverlays
        onSave={(editedUri) => {
          setImage(editedUri);
          setShowEditor(false);
        }}
        onCancel={() => {
          setShowEditor(false);
          if (!image) setOpeningCamera(false);
        }}
      />
    );
  }

  // Capture stage — Instagram-style dark canvas before/after camera dismiss
  if (!image) {
    return (
      <View style={[styles.captureRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={tw`flex-row items-center justify-between px-4 py-3`}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={tw`text-white text-base font-bold tracking-wide`}>Story</Text>
          <View style={tw`w-10`} />
        </View>

        <View style={tw`flex-1 items-center justify-center px-8`}>
          {openingCamera ? (
            <>
              <ActivityIndicator size="large" color="#34D399" />
              <Text style={tw`text-stone-400 text-sm mt-4`}>Opening camera…</Text>
            </>
          ) : (
            <>
              <View
                style={[
                  tw`rounded-full items-center justify-center mb-6`,
                  { width: 88, height: 88, backgroundColor: 'rgba(16,185,129,0.15)' },
                ]}
              >
                <Ionicons name="camera" size={40} color="#34D399" />
              </View>
              <Text style={tw`text-white text-xl font-bold text-center`}>Capture your moment</Text>
              <Text style={tw`text-stone-400 text-sm text-center mt-2 mb-8 leading-5`}>
                Stories disappear after 24 hours. Shoot now or pick from your gallery.
              </Text>

              <Pressable
                onPress={() => void takePhoto()}
                style={tw`w-full flex-row items-center justify-center gap-2 bg-brand-600 py-4 rounded-full mb-3`}
              >
                <Ionicons name="camera" size={22} color="#fff" />
                <Text style={tw`text-white font-bold text-base`}>Open camera</Text>
              </Pressable>

              <Pressable
                onPress={() => void pickImage()}
                style={tw`w-full flex-row items-center justify-center gap-2 bg-white/10 border border-white/15 py-4 rounded-full`}
              >
                <Ionicons name="images-outline" size={20} color="#fff" />
                <Text style={tw`text-white font-semibold text-base`}>Gallery</Text>
              </Pressable>
            </>
          )}
        </View>

        {!openingCamera && (
          <View style={tw`flex-row items-center justify-center gap-10 px-6 pb-6`}>
            <Pressable onPress={() => void pickImage()} style={tw`items-center`} hitSlop={8}>
              <View style={tw`w-12 h-12 rounded-xl border-2 border-white/40 overflow-hidden bg-stone-800 items-center justify-center`}>
                <Ionicons name="images" size={22} color="#A8A29E" />
              </View>
              <Text style={tw`text-stone-500 text-[10px] mt-1.5 font-semibold`}>Gallery</Text>
            </Pressable>
            <Pressable onPress={() => void takePhoto()} hitSlop={8}>
              <View
                style={[
                  tw`rounded-full border-4 border-white items-center justify-center`,
                  { width: 72, height: 72 },
                ]}
              >
                <View style={[tw`rounded-full bg-white`, { width: 58, height: 58 }]} />
              </View>
            </Pressable>
            <View style={tw`w-12 items-center opacity-0`}>
              <View style={tw`w-12 h-12`} />
            </View>
          </View>
        )}
      </View>
    );
  }

  // Share stage after edit
  return (
    <View style={[styles.captureRoot, { paddingTop: insets.top }]}>
      <View style={tw`flex-row items-center justify-between px-4 py-3`}>
        <Pressable
          onPress={() => {
            setImage(null);
            setCaption('');
            void takePhoto();
          }}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          accessibilityLabel="Retake"
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={tw`text-white text-base font-bold`}>Your story</Text>
        <Pressable
          onPress={() => setShowEditor(true)}
          hitSlop={12}
          style={tw`w-10 h-10 rounded-full bg-white/10 items-center justify-center`}
          accessibilityLabel="Edit"
        >
          <Ionicons name="color-filter-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        style={tw`flex-1`}
        contentContainerStyle={tw`px-4 pb-4`}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            tw`rounded-3xl overflow-hidden bg-stone-900 border border-white/10`,
            { height: Math.min(SCREEN_H * 0.58, SCREEN_W * 1.55) },
          ]}
        >
          <Image source={{ uri: image }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <View style={tw`absolute top-3 right-3 flex-row gap-2`}>
            <Pressable
              onPress={() => setShowEditor(true)}
              style={tw`bg-black/50 rounded-full px-3 py-2 flex-row items-center gap-1.5`}
            >
              <Ionicons name="text-outline" size={16} color="#fff" />
              <Text style={tw`text-white text-xs font-semibold`}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <Text style={tw`text-stone-400 text-[11px] font-semibold uppercase tracking-wide mt-5 mb-2`}>
          Caption
        </Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption…"
          placeholderTextColor="#78716C"
          multiline
          maxLength={180}
          style={tw`bg-white/8 border border-white/10 rounded-2xl px-4 py-3.5 min-h-24 text-white text-base`}
        />
        <Text style={tw`text-stone-500 text-xs mt-2 text-right`}>{caption.length}/180</Text>
      </ScrollView>

      <View
        style={[
          tw`px-4 pt-3 border-t border-white/10 flex-row gap-3`,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <Pressable
          onPress={() => void pickImage()}
          style={tw`flex-1 py-3.5 rounded-full bg-white/10 items-center justify-center border border-white/10`}
        >
          <Text style={tw`text-white font-semibold`}>Gallery</Text>
        </Pressable>
        <Pressable
          onPress={() => void publishStory()}
          disabled={posting}
          style={tw`flex-[1.4] py-3.5 rounded-full bg-brand-600 items-center justify-center flex-row gap-2`}
        >
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={tw`text-white font-bold`}>Share story</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captureRoot: {
    flex: 1,
    backgroundColor: '#0C0A09',
  },
});
