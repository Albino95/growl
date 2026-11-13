import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import tw from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { uploadMediaFile } from '../../services/api/media';
import { waterSeed, type GrowthSeed } from '../../services/api/seeds';
import { daysSincePlanted, goalSchemaFor, fallbackGoalSchema } from './seedGoalMeta';
import { feedback, hushNativeAudio } from '../../utils/interactionFeedback';
import { alertMessage } from '../../utils/confirmDialog';

type Props = {
  visible: boolean;
  seed: GrowthSeed | null;
  onClose: () => void;
  onDone: (seed: GrowthSeed, stagedUp: boolean) => void;
};

export default function SeedCheckInSheet({ visible, seed, onClose, onDone }: Props) {
  const [metricText, setMetricText] = useState('');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!seed) return null;

  const schema = seed.metric_type
    ? goalSchemaFor(seed.subcategory_key) || fallbackGoalSchema()
    : goalSchemaFor(seed.subcategory_key);
  const days = seed.days_since_planted ?? daysSincePlanted(seed.planted_at);
  const requirePhoto = !!(schema?.requirePhoto || seed.metric_type);
  const requireMetric = !!(seed.metric_type || schema);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Photos needed', 'Allow photo access to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      hushNativeAudio();
      feedback.select();
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alertMessage('Camera needed', 'Allow camera access for evidence photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.75,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      hushNativeAudio();
      feedback.select();
    }
  };

  const submit = async () => {
    if (busy) return;
    const metric_value = metricText.trim() ? Number(metricText.trim()) : undefined;
    if (requireMetric && (metric_value == null || Number.isNaN(metric_value))) {
      void alertMessage('Number required', schema?.checkInLabel || 'Enter today’s number');
      return;
    }
    if (requirePhoto && !photoUri) {
      void alertMessage('Photo evidence', 'Add a photo to testify this check-in.');
      return;
    }

    Keyboard.dismiss();
    hushNativeAudio();
    setBusy(true);
    try {
      let photo_url: string | undefined;
      if (photoUri) {
        const uploaded = await uploadMediaFile(photoUri, 'post');
        photo_url = uploaded.url;
      }
      const res = await waterSeed(seed.id, {
        action: 'check_in',
        note: note.trim() || undefined,
        photo_url,
        metric_value,
      });
      setMetricText('');
      setNote('');
      setPhotoUri(null);
      onClose();
      onDone(res.seed, res.staged_up);
      // Haptics only — expo-av after Camera/ImagePicker can lock the iOS JS bridge.
      feedback.success();
    } catch (e) {
      feedback.error();
      void alertMessage('Could not check in', e instanceof Error ? e.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
        <View style={tw`bg-[#FFFcf7] rounded-t-3xl px-5 pt-3 pb-10 max-h-[88%]`}>
          <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mb-4`} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={tw`text-[11px] font-semibold tracking-widest text-emerald-700 uppercase`}>
              Check in
            </Text>
            <Text style={tw`text-2xl font-bold text-stone-900 mt-0.5`}>{seed.title}</Text>
            <View style={tw`flex-row items-center mt-2 mb-4`}>
              <View style={tw`px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100`}>
                <Text style={tw`text-xs font-bold text-emerald-800`}>Day {days}</Text>
              </View>
              <Text style={tw`text-xs text-stone-500 ml-2`}>since you planted this seed</Text>
            </View>

            {requireMetric ? (
              <View style={tw`mb-4`}>
                <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
                  {schema?.checkInLabel || 'Today’s number'}
                  {schema?.unitLabel ? ` (${schema.unitLabel})` : ''}
                </Text>
                <TextInput
                  value={metricText}
                  onChangeText={setMetricText}
                  keyboardType="decimal-pad"
                  placeholder={
                    seed.metric_current != null
                      ? `Last: ${seed.metric_current}${schema?.unitLabel ? ` ${schema.unitLabel}` : ''}`
                      : 'e.g. 72.4'
                  }
                  placeholderTextColor="#78716C"
                  style={tw`bg-[#EAE4D6] px-4 py-3.5 rounded-2xl text-stone-900 text-[18px] font-semibold border border-stone-200`}
                />
                {seed.metric_start != null && seed.metric_target != null ? (
                  <Text style={tw`text-xs text-stone-500 mt-1.5`}>
                    Path: {seed.metric_start}
                    {schema?.unitLabel ? ` ${schema.unitLabel}` : ''} → {seed.metric_target}
                    {schema?.unitLabel ? ` ${schema.unitLabel}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
              Evidence {requirePhoto ? '(required)' : '(optional)'}
            </Text>
            <Text style={tw`text-sm text-stone-500 mb-3 leading-5`}>
              {schema?.hint || 'A quick photo keeps this honest for you and your witnesses.'}
            </Text>

            {photoUri ? (
              <View style={tw`mb-3 rounded-2xl overflow-hidden border border-stone-200`}>
                <Image source={{ uri: photoUri }} style={tw`w-full h-44`} resizeMode="cover" />
                <PressableScale
                  onPress={() => setPhotoUri(null)}
                  feedback="close"
                  style={tw`absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 items-center justify-center`}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </PressableScale>
              </View>
            ) : (
              <View style={tw`flex-row gap-2 mb-3`}>
                <PressableScale
                  onPress={() => void takePhoto()}
                  feedback="open"
                  style={tw`flex-1 py-3.5 rounded-2xl bg-stone-900 items-center flex-row justify-center gap-2`}
                >
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={tw`text-white font-bold`}>Camera</Text>
                </PressableScale>
                <PressableScale
                  onPress={() => void pickPhoto()}
                  feedback="open"
                  style={tw`flex-1 py-3.5 rounded-2xl bg-[#EAE4D6] border border-stone-200 items-center flex-row justify-center gap-2`}
                >
                  <Ionicons name="images-outline" size={18} color="#1C1917" />
                  <Text style={tw`text-stone-900 font-bold`}>Library</Text>
                </PressableScale>
              </View>
            )}

            <Text style={tw`text-xs font-semibold tracking-widest text-stone-500 uppercase mb-2`}>
              Note
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="How did it feel?"
              placeholderTextColor="#78716C"
              multiline
              style={tw`bg-[#FFFcf7] border border-stone-200 rounded-2xl px-4 py-3 text-stone-900 text-[15px] min-h-[72px] mb-5`}
            />

            <PressableScale
              onPress={() => void submit()}
              disabled={busy}
              feedback={false}
              style={tw`py-4 rounded-2xl bg-emerald-600 items-center flex-row justify-center gap-2 ${
                busy ? 'opacity-60' : ''
              }`}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="water" size={18} color="#fff" />
              )}
              <Text style={tw`text-white font-bold text-[16px]`}>
                {busy ? 'Watering…' : 'Testify & water'}
              </Text>
            </PressableScale>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
