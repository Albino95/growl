import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { alertMessage } from '../../../utils/confirmDialog';

export type ReelCaptureResult = {
  uri: string;
  kind: 'image' | 'video';
  mimeType?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (result: ReelCaptureResult) => void;
};

type CaptureMode = 'photo' | 'video';

const HOLD_MS = 280;
const MAX_VIDEO_SEC = 60;

/**
 * Instagram-style capture:
 * - Photo mode: tap = photo, hold = record video
 * - Video mode: tap = start / stop recording
 */
export default function ReelCameraCapture({ visible, onClose, onCaptured }: Props) {
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [mode, setMode] = useState<CaptureMode>('photo');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);
  const pressActive = useRef(false);
  const holdTriggered = useRef(false);
  /** True when recording was started by Video-mode tap (release should not stop). */
  const tapRecordMode = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const clearTick = () => {
    if (recordTick.current) {
      clearInterval(recordTick.current);
      recordTick.current = null;
    }
  };

  const ensurePermissions = async () => {
    let cam = camPerm;
    if (!cam?.granted) {
      cam = await requestCamPerm();
    }
    if (!cam?.granted) {
      await alertMessage('Permission needed', 'Allow camera access to capture a reel.');
      return false;
    }
    if (Platform.OS !== 'web') {
      let mic = micPerm;
      if (!mic?.granted) {
        mic = await requestMicPerm();
      }
      if (!mic?.granted) {
        await alertMessage(
          'Microphone needed',
          'Allow microphone access to record video with sound.'
        );
        return false;
      }
    }
    return true;
  };

  const takePhoto = async () => {
    if (!cameraRef.current || busy || recordingRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (photo?.uri) {
        onCaptured({ uri: photo.uri, kind: 'image', mimeType: 'image/jpeg' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not take photo';
      await alertMessage('Camera', msg);
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async (fromTapMode: boolean) => {
    if (!cameraRef.current || recordingRef.current || busy) return;

    tapRecordMode.current = fromTapMode;

    if (Platform.OS === 'web') {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Videos,
          videoMaxDuration: MAX_VIDEO_SEC,
          quality: 0.92,
        });
        if (!result.canceled && result.assets[0]) {
          const a = result.assets[0];
          onCaptured({
            uri: a.uri,
            kind: 'video',
            mimeType: a.mimeType || 'video/mp4',
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not record video';
        await alertMessage('Camera', msg);
      }
      tapRecordMode.current = false;
      return;
    }

    recordingRef.current = true;
    setRecording(true);
    setRecordSec(0);
    clearTick();
    recordTick.current = setInterval(() => {
      setRecordSec((s) => {
        if (s + 1 >= MAX_VIDEO_SEC) {
          void stopRecording();
        }
        return s + 1;
      });
    }, 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_SEC,
      });
      clearTick();
      recordingRef.current = false;
      setRecording(false);
      tapRecordMode.current = false;
      if (result?.uri) {
        onCaptured({ uri: result.uri, kind: 'video', mimeType: 'video/mp4' });
      }
    } catch (e) {
      clearTick();
      recordingRef.current = false;
      setRecording(false);
      tapRecordMode.current = false;
      const msg = e instanceof Error ? e.message : 'Could not record video';
      await alertMessage('Camera', msg);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current || !cameraRef.current) return;
    try {
      cameraRef.current.stopRecording();
    } catch {
      /* ignore */
    }
  };

  const switchMode = (next: CaptureMode) => {
    if (recordingRef.current) return;
    setMode(next);
  };

  /** Video mode: tap toggles record on/off */
  const onVideoShutterPress = () => {
    if (!ready || busy) return;
    if (recordingRef.current) {
      void stopRecording();
      return;
    }
    void startRecording(true);
  };

  /** Photo mode: tap = photo, hold = video (release stops) */
  const onPhotoPressIn = () => {
    if (mode !== 'photo' || !ready || busy) return;
    pressActive.current = true;
    holdTriggered.current = false;
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      holdTriggered.current = true;
      if (pressActive.current) void startRecording(false);
    }, HOLD_MS);
  };

  const onPhotoPressOut = () => {
    if (mode !== 'photo') return;
    pressActive.current = false;
    const shortTap = !holdTriggered.current;
    clearHold();
    // Hold-to-record: release stops. Tap-to-record (video mode) ignores release.
    if (recordingRef.current && !tapRecordMode.current) {
      void stopRecording();
      return;
    }
    if (shortTap && !recordingRef.current) void takePhoto();
  };

  if (!visible) return null;

  if (!camPerm) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
        <View style={tw`flex-1 bg-black items-center justify-center`}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      </Modal>
    );
  }

  const needsPerm = !camPerm.granted;
  const hint =
    mode === 'video'
      ? recording
        ? 'Tap to stop'
        : Platform.OS === 'web'
          ? 'Tap to open video camera'
          : 'Tap to start recording'
      : Platform.OS === 'web'
        ? 'Tap photo · Hold opens video camera'
        : 'Tap photo · Hold for video';

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={tw`flex-1 bg-black`}>
        {needsPerm ? (
          <SafeAreaView style={tw`flex-1 items-center justify-center px-8`}>
            <Ionicons name="camera-outline" size={48} color="#A8A29E" />
            <Text style={tw`text-white text-lg font-bold mt-4 text-center`}>
              Camera access required
            </Text>
            <Text style={tw`text-stone-400 text-sm text-center mt-2 mb-6`}>
              Tap below to allow camera (and mic for video)
            </Text>
            <Pressable
              onPress={() => void ensurePermissions()}
              style={tw`bg-brand-600 px-6 py-3.5 rounded-full`}
            >
              <Text style={tw`text-white font-bold`}>Allow camera</Text>
            </Pressable>
            <Pressable onPress={onClose} style={tw`mt-4 py-2`}>
              <Text style={tw`text-stone-400 font-semibold`}>Cancel</Text>
            </Pressable>
          </SafeAreaView>
        ) : (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFillObject}
              facing={facing}
              mode="video"
              mute={false}
              onCameraReady={() => setReady(true)}
            />

            <SafeAreaView style={tw`flex-1`} pointerEvents="box-none">
              <View style={tw`flex-row items-center justify-between px-4 pt-2`}>
                <Pressable
                  onPress={onClose}
                  style={tw`w-10 h-10 rounded-full bg-black/45 items-center justify-center`}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
                {recording ? (
                  <View style={tw`flex-row items-center bg-red-600/90 px-3 py-1.5 rounded-full`}>
                    <View style={tw`w-2 h-2 rounded-full bg-white mr-2`} />
                    <Text style={tw`text-white text-xs font-bold`}>
                      {String(Math.floor(recordSec / 60)).padStart(1, '0')}:
                      {String(recordSec % 60).padStart(2, '0')}
                    </Text>
                  </View>
                ) : (
                  <View style={tw`w-10`} />
                )}
                <Pressable
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  disabled={recording}
                  style={tw`w-10 h-10 rounded-full bg-black/45 items-center justify-center`}
                >
                  <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                </Pressable>
              </View>

              <View style={tw`flex-1`} />

              <View style={tw`items-center pb-8`}>
                {/* Photo / Video mode switch */}
                <View
                  style={tw`flex-row mb-5 bg-black/50 rounded-full p-1 border border-white/15`}
                >
                  <Pressable
                    onPress={() => switchMode('photo')}
                    disabled={recording}
                    style={[
                      tw`px-5 py-2 rounded-full`,
                      mode === 'photo' ? tw`bg-white` : tw`bg-transparent`,
                    ]}
                  >
                    <Text
                      style={tw`text-xs font-bold ${
                        mode === 'photo' ? 'text-black' : 'text-white/80'
                      }`}
                    >
                      Photo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchMode('video')}
                    disabled={recording}
                    style={[
                      tw`px-5 py-2 rounded-full`,
                      mode === 'video' ? tw`bg-white` : tw`bg-transparent`,
                    ]}
                  >
                    <Text
                      style={tw`text-xs font-bold ${
                        mode === 'video' ? 'text-black' : 'text-white/80'
                      }`}
                    >
                      Video
                    </Text>
                  </Pressable>
                </View>

                {!ready || busy ? (
                  <ActivityIndicator color="#fff" style={tw`mb-4`} />
                ) : null}

                {mode === 'video' ? (
                  <Pressable
                    onPress={onVideoShutterPress}
                    disabled={!ready || busy}
                    style={[
                      tw`w-[78px] h-[78px] rounded-full items-center justify-center border-4`,
                      {
                        borderColor: recording ? '#EF4444' : '#EF4444',
                        backgroundColor: recording ? 'rgba(239,68,68,0.35)' : 'transparent',
                      },
                    ]}
                  >
                    <View
                      style={[
                        recording
                          ? tw`w-8 h-8 bg-red-500 rounded-lg`
                          : tw`w-[62px] h-[62px] rounded-full bg-red-500`,
                      ]}
                    />
                  </Pressable>
                ) : (
                  <Pressable
                    onPressIn={onPhotoPressIn}
                    onPressOut={onPhotoPressOut}
                    disabled={!ready || busy}
                    style={[
                      tw`w-[78px] h-[78px] rounded-full items-center justify-center border-4`,
                      {
                        borderColor: recording ? '#EF4444' : '#FFFFFF',
                        backgroundColor: recording ? 'rgba(239,68,68,0.35)' : 'transparent',
                      },
                    ]}
                  >
                    <View
                      style={[
                        tw`rounded-full`,
                        recording
                          ? tw`w-8 h-8 bg-red-500 rounded-lg`
                          : tw`w-[62px] h-[62px] bg-white`,
                      ]}
                    />
                  </Pressable>
                )}

                <Text style={tw`text-white/70 text-xs mt-3 font-medium`}>{hint}</Text>
              </View>
            </SafeAreaView>
          </>
        )}
      </View>
    </Modal>
  );
}
