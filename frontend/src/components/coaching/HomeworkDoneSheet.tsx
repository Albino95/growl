import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { uploadMediaFile } from '../../services/api/media';
import { waterSeed } from '../../services/api/seeds';
import type { CoachingAssignment } from '../../services/api/instructor';
import { FAST_IMAGE_PICKER } from '../../utils/prepareImageUpload';
import { showPermissionDenied } from '../../utils/permissionPrompt';
import { feedback, hushNativeAudio } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';

type Props = {
  visible: boolean;
  assignment: CoachingAssignment | null;
  onClose: () => void;
  /** Called after the check-in is saved so the plan can reload. */
  onDone: () => void;
};

/**
 * Client-side "Mark done" for coaching homework: optional note + optional
 * photo, saved as a check-in on the homework's backing record.
 */
export default function HomeworkDoneSheet({ visible, assignment, onClose, onDone }: Props) {
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Fresh form for each homework item.
  useEffect(() => {
    if (visible) {
      setNote('');
      setPhotoUri(null);
    }
  }, [visible, assignment?.id]);

  if (!assignment) return null;

  const applyPicked = (result: ImagePicker.ImagePickerResult) => {
    hushNativeAudio();
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      feedback.select();
    }
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('photos', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow photo access to add a photo to your homework.',
        });
        return;
      }
      applyPicked(await ImagePicker.launchImageLibraryAsync(FAST_IMAGE_PICKER));
    } catch {
      void alertMessage('Could not add photo', 'Try another photo, or use the camera.');
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        await showPermissionDenied('camera', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow camera access to take a photo of your homework.',
        });
        return;
      }
      applyPicked(
        await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.72, exif: false })
      );
    } catch {
      void alertMessage('Camera unavailable', 'Use your photo library instead, or try again.');
    }
  };

  const submit = async () => {
    if (busy) return;
    Keyboard.dismiss();
    hushNativeAudio();
    setBusy(true);
    try {
      let photo_url: string | undefined;
      if (photoUri) {
        const uploaded = await uploadMediaFile(photoUri, 'post');
        photo_url = uploaded.url;
      }
      await waterSeed(assignment.seed_id, {
        action: 'check_in',
        note: note.trim() || undefined,
        photo_url,
        assignment_id: assignment.id,
      });
      feedback.success();
      onClose();
      onDone();
    } catch (e) {
      feedback.error();
      void alertMessage('Could not mark done', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={tw`flex-1 justify-end bg-black/40`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PressableScale
          onPress={() => {
            if (!busy) onClose();
          }}
          feedback="close"
          style={tw`flex-1`}
          accessibilityLabel="Dismiss"
        />
        <View style={tw`bg-[#F3EEE4] rounded-t-3xl px-5 pt-3 pb-8 max-h-[88%]`}>
          <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Mark done
            </Text>
            <Text style={tw`text-xl font-bold text-stone-900 mt-0.5`}>{assignment.title}</Text>
            <Text style={tw`text-sm text-stone-500 mt-1 mb-4 leading-5`}>
              Add a photo or a short note so your coach can see how it went. Both are optional.
            </Text>

            {photoUri ? (
              <View style={tw`mb-3 rounded-2xl overflow-hidden border border-stone-200`}>
                <Image source={{ uri: photoUri }} style={tw`w-full h-44`} contentFit="cover" />
                <PressableScale
                  onPress={() => setPhotoUri(null)}
                  feedback="close"
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  style={tw`absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 items-center justify-center`}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </PressableScale>
              </View>
            ) : (
              <View style={tw`flex-row gap-2 mb-3`}>
                <PressableScale
                  onPress={() => void takePhoto()}
                  disabled={busy}
                  feedback="open"
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo"
                  style={tw`flex-1 py-3 rounded-2xl bg-stone-900 items-center flex-row justify-center gap-2`}
                >
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={tw`text-white font-bold`}>Camera</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => void pickPhoto()}
                  disabled={busy}
                  feedback="open"
                  accessibilityRole="button"
                  accessibilityLabel="Choose a photo"
                  style={tw`flex-1 py-3 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center flex-row justify-center gap-2`}
                >
                  <Ionicons name="images-outline" size={18} color="#1C1917" />
                  <Text style={tw`text-stone-900 font-bold`}>Library</Text>
                </PressableScale>
              </View>
            )}

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note for your coach (optional)"
              placeholderTextColor="#A8A29E"
              multiline
              maxLength={500}
              editable={!busy}
              style={tw`bg-[#FFFcf7] border border-stone-200/80 rounded-2xl px-3.5 py-3 text-[15px] text-stone-900 min-h-[72px] mb-4`}
            />

            <PressableScale
              onPress={() => void submit()}
              disabled={busy}
              feedback={false}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              style={tw`py-3.5 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2 ${
                busy ? 'opacity-60' : ''
              }`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
              )}
              <Text style={tw`text-white font-bold`}>{busy ? 'Saving…' : 'Mark done'}</Text>
            </PressableScale>
            <PressableScale
              onPress={() => {
                if (!busy) onClose();
              }}
              style={tw`py-3 items-center mt-1`}
            >
              <Text style={tw`text-stone-500 font-semibold`}>Cancel</Text>
            </PressableScale>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
