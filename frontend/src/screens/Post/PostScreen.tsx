import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PhotoEditor from '../../components/ui/PhotoEditor';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useCreatePost } from '../../hooks/useCreatePost';
import { confirmAsync, alertMessage } from '../../utils/confirmDialog';
import PostComposerLayout from './components/PostComposerLayout';
import PostImageStage from './components/PostImageStage';
import PostCaptionOverlay from './components/PostCaptionOverlay';
import PostCategorySheet from './components/PostCategorySheet';
import PostMusicSheet from './components/PostMusicSheet';
import PostStickyBar from './components/PostStickyBar';
import tw from '../../lib/tw';

type PostScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Post'>;

interface PostScreenProps {
  navigation: PostScreenNavigationProp;
}

export default function PostScreen({ navigation }: PostScreenProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showMusicSheet, setShowMusicSheet] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const captionInputRef = useRef<import('react-native').TextInput>(null);
  const openEditorAfterPick = useRef(false);

  const {
    image,
    caption,
    selectedCategory,
    audioTrack,
    isPosting,
    userCategories,
    hasDraft,
    setImage,
    setCaption,
    setCategory,
    setAudioTrack,
    clearDraft,
    submitPost,
  } = useCreatePost(() => {
    setShowSuccess(true);
    setTimeout(() => {
      navigation.goBack();
    }, 600);
  });

  useEffect(() => {
    if (image && openEditorAfterPick.current) {
      openEditorAfterPick.current = false;
      setShowEditor(true);
      return;
    }
    if (image && !showEditor) {
      const timer = setTimeout(() => captionInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [image, showEditor]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'We need camera roll permissions to post images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]) {
      openEditorAfterPick.current = true;
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Permission needed', 'We need camera permissions to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      openEditorAfterPick.current = true;
      setImage(result.assets[0].uri);
    }
  };

  const handleRemovePhoto = async () => {
    const confirmed = await confirmAsync(
      'Remove photo?',
      'This will clear the image and caption for this draft.',
      { confirmLabel: 'Remove', destructive: true }
    );
    if (!confirmed) return;
    setImage(null);
    setCaption('');
    setAudioTrack(null);
  };

  const handleClose = async () => {
    if (!hasDraft) {
      navigation.goBack();
      return;
    }
    const confirmed = await confirmAsync(
      'Discard post?',
      'Your draft will be lost.',
      { confirmLabel: 'Discard', destructive: true }
    );
    if (!confirmed) return;
    clearDraft();
    navigation.goBack();
  };

  if (showEditor && image) {
    return (
      <PhotoEditor
        imageUri={image}
        title="Edit Post"
        preferredAspect="4:5"
        enableOverlays
        onSave={(editedUri) => {
          setImage(editedUri);
          setShowEditor(false);
        }}
        onCancel={() => setShowEditor(false)}
      />
    );
  }

  const canPost = Boolean(image && selectedCategory && !isPosting);

  return (
    <PostComposerLayout
      footer={
        image ? (
          <PostStickyBar
            selectedCategory={selectedCategory}
            audioTrack={audioTrack}
            hasImage
            isPosting={isPosting}
            canPost={canPost}
            onOpenCategory={() => setShowCategorySheet(true)}
            onOpenMusic={() => setShowMusicSheet(true)}
            onSubmit={submitPost}
          />
        ) : null
      }
    >
      <ScreenHeader
        title="Create Post"
        onBack={handleClose}
        backIcon="close"
        transparent
        light
        style={tw`border-b-0 bg-transparent absolute top-0 left-0 right-0 z-20`}
        rightAction={
          image ? (
            <Pressable
              onPress={() => void handleRemovePhoto()}
              hitSlop={8}
              style={tw`w-10 h-10 items-center justify-center`}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
            </Pressable>
          ) : undefined
        }
      />

      {showSuccess && (
        <View style={tw`absolute inset-0 z-50 bg-brand-600/90 items-center justify-center`}>
          <View style={tw`bg-white rounded-full p-4 mb-3`}>
            <Text style={tw`text-3xl`}>✓</Text>
          </View>
          <Text style={tw`text-white text-xl font-bold`}>Posted!</Text>
        </View>
      )}

      <PostImageStage
        image={image}
        isPosting={isPosting}
        hasMusic={Boolean(audioTrack)}
        onTakePhoto={takePhoto}
        onPickLibrary={pickImage}
        onEditPhoto={() => setShowEditor(true)}
        onRemovePhoto={() => void handleRemovePhoto()}
        onOpenMusic={() => setShowMusicSheet(true)}
      />

      {image && (
        <PostCaptionOverlay
          caption={caption}
          onChangeCaption={setCaption}
          inputRef={captionInputRef}
        />
      )}

      <PostCategorySheet
        visible={showCategorySheet}
        onClose={() => setShowCategorySheet(false)}
        userCategories={userCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setCategory}
      />

      <PostMusicSheet
        visible={showMusicSheet}
        onClose={() => setShowMusicSheet(false)}
        selectedTrack={audioTrack}
        onSelectTrack={setAudioTrack}
      />
    </PostComposerLayout>
  );
}
