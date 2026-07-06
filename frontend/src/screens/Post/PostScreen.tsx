import React, { useState, useRef, useEffect } from 'react';
import { View, Alert, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PhotoEditor from '../../components/ui/PhotoEditor';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useCreatePost } from '../../hooks/useCreatePost';
import PostComposerLayout from './components/PostComposerLayout';
import PostImageStage from './components/PostImageStage';
import PostCaptionOverlay from './components/PostCaptionOverlay';
import PostCategorySheet from './components/PostCategorySheet';
import PostStickyBar from './components/PostStickyBar';
import tw from '../../lib/tw';

type PostScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Post'>;

interface PostScreenProps {
  navigation: PostScreenNavigationProp;
}

export default function PostScreen({ navigation }: PostScreenProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const captionInputRef = useRef<import('react-native').TextInput>(null);

  const {
    image,
    caption,
    selectedCategory,
    isPosting,
    userCategories,
    hasDraft,
    setImage,
    setCaption,
    setCategory,
    clearDraft,
    submitPost,
  } = useCreatePost(() => {
    setShowSuccess(true);
    setTimeout(() => {
      navigation.goBack();
    }, 600);
  });

  useEffect(() => {
    if (image) {
      const timer = setTimeout(() => captionInputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [image]);

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
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setImage(null);
          setCaption('');
        },
      },
    ]);
  };

  const handleClose = () => {
    if (!hasDraft) {
      navigation.goBack();
      return;
    }
    Alert.alert('Discard post?', 'Your draft will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          clearDraft();
          navigation.goBack();
        },
      },
    ]);
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

  const canPost = Boolean(image && selectedCategory && !isPosting);

  return (
    <PostComposerLayout
      footer={
        image ? (
          <PostStickyBar
            selectedCategory={selectedCategory}
            hasImage
            isPosting={isPosting}
            canPost={canPost}
            onOpenCategory={() => setShowCategorySheet(true)}
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
        style={tw`border-b-0 bg-transparent absolute top-0 left-0 right-0 z-10`}
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
        onTakePhoto={takePhoto}
        onPickLibrary={pickImage}
        onEditPhoto={() => setShowEditor(true)}
        onRemovePhoto={handleRemovePhoto}
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
    </PostComposerLayout>
  );
}
