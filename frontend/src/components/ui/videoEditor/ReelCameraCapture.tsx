import React, { useRef, useState, useEffect, useCallback } from 'react';
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

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
    return 'video/webm;codecs=vp9,opus';
  }
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    return 'video/webm;codecs=vp8,opus';
  }
  if (MediaRecorder.isTypeSupported('video/webm')) return 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
  return 'video/webm';
}

/**
 * Instagram-style capture:
 * - Photo mode: tap = photo, hold = record video
 * - Video mode: tap = start / stop recording
 * Web uses getUserMedia + MediaRecorder (stays in this screen).
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

  // Web camera stream
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef(false);
  const pressActive = useRef(false);
  const holdTriggered = useRef(false);
  const tapRecordMode = useRef(false);

  const isWeb = Platform.OS === 'web';

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

  const stopWebStream = useCallback(() => {
    webStreamRef.current?.getTracks().forEach((t) => t.stop());
    webStreamRef.current = null;
    if (webVideoRef.current) webVideoRef.current.srcObject = null;
  }, []);

  const ensurePermissions = async () => {
    let cam = camPerm;
    if (!cam?.granted) cam = await requestCamPerm();
    if (!cam?.granted) {
      await alertMessage('Permission needed', 'Allow camera access to capture a reel.');
      return false;
    }
    if (!isWeb) {
      let mic = micPerm;
      if (!mic?.granted) mic = await requestMicPerm();
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

  // Web: bind camera stream to preview video element
  useEffect(() => {
    if (!visible || !isWeb || !camPerm?.granted) return;

    let cancelled = false;
    setReady(false);

    const startWebCamera = async () => {
      try {
        stopWebStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing === 'front' ? 'user' : 'environment' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        webStreamRef.current = stream;
        const video = webVideoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          await video.play();
        }
        setReady(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not access camera';
        await alertMessage('Camera', msg);
        setReady(false);
      }
    };

    void startWebCamera();

    return () => {
      cancelled = true;
      if (webRecorderRef.current?.state === 'recording') {
        try {
          webRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      stopWebStream();
    };
  }, [visible, isWeb, camPerm?.granted, facing, stopWebStream]);

  const takePhoto = async () => {
    if (busy || recordingRef.current) return;

    if (isWeb) {
      const video = webVideoRef.current;
      if (!video || video.videoWidth < 2) return;
      setBusy(true);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not capture frame');
        ctx.drawImage(video, 0, 0);
        const uri = canvas.toDataURL('image/jpeg', 0.92);
        onCaptured({ uri, kind: 'image', mimeType: 'image/jpeg' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not take photo';
        await alertMessage('Camera', msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!cameraRef.current) return;
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

  const beginRecordingUi = () => {
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
  };

  const finishRecordingUi = () => {
    clearTick();
    recordingRef.current = false;
    setRecording(false);
    tapRecordMode.current = false;
  };

  const startRecording = async (fromTapMode: boolean) => {
    if (recordingRef.current || busy) return;
    tapRecordMode.current = fromTapMode;

    if (isWeb) {
      const stream = webStreamRef.current;
      if (!stream || typeof MediaRecorder === 'undefined') {
        await alertMessage('Camera', 'Video recording is not supported in this browser.');
        return;
      }
      try {
        webChunksRef.current = [];
        const mimeType = pickRecorderMime();
        const recorder = new MediaRecorder(stream, { mimeType });
        webRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) webChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          finishRecordingUi();
          const blob = new Blob(webChunksRef.current, {
            type: recorder.mimeType || mimeType,
          });
          if (blob.size > 0) {
            const uri = URL.createObjectURL(blob);
            onCaptured({
              uri,
              kind: 'video',
              mimeType: blob.type || 'video/webm',
            });
          }
          webRecorderRef.current = null;
        };
        recorder.start(250);
        beginRecordingUi();
      } catch (e) {
        finishRecordingUi();
        const msg = e instanceof Error ? e.message : 'Could not start recording';
        await alertMessage('Camera', msg);
      }
      return;
    }

    if (!cameraRef.current) return;
    beginRecordingUi();
    try {
      const result = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_SEC });
      finishRecordingUi();
      if (result?.uri) {
        onCaptured({ uri: result.uri, kind: 'video', mimeType: 'video/mp4' });
      }
    } catch (e) {
      finishRecordingUi();
      const msg = e instanceof Error ? e.message : 'Could not record video';
      await alertMessage('Camera', msg);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    if (isWeb) {
      try {
        if (webRecorderRef.current?.state === 'recording') {
          webRecorderRef.current.stop();
        } else {
          finishRecordingUi();
        }
      } catch {
        finishRecordingUi();
      }
      return;
    }

    if (!cameraRef.current) return;
    try {
      cameraRef.current.stopRecording();
    } catch {
      finishRecordingUi();
    }
  };

  const switchMode = (next: CaptureMode) => {
    if (recordingRef.current) return;
    setMode(next);
  };

  const onVideoShutterPress = () => {
    if (!ready || busy) return;
    if (recordingRef.current) void stopRecording();
    else void startRecording(true);
  };

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
        : 'Tap to start recording'
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
            <Pressable
              onPress={() => void ensurePermissions()}
              style={tw`bg-brand-600 px-6 py-3.5 rounded-full mt-6`}
            >
              <Text style={tw`text-white font-bold`}>Allow camera</Text>
            </Pressable>
            <Pressable onPress={onClose} style={tw`mt-4 py-2`}>
              <Text style={tw`text-stone-400 font-semibold`}>Cancel</Text>
            </Pressable>
          </SafeAreaView>
        ) : (
          <>
            {isWeb ? (
              // eslint-disable-next-line react/no-unknown-property
              <video
                ref={(el) => {
                  webVideoRef.current = el;
                }}
                playsInline
                autoPlay
                muted
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facing === 'front' ? 'scaleX(-1)' : undefined,
                }}
              />
            ) : (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={facing}
                mode="video"
                mute={false}
                onCameraReady={() => setReady(true)}
              />
            )}

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
                  <Text style={tw`text-white/80 text-xs font-semibold`}>{hint}</Text>
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
                <View style={tw`flex-row mb-5 bg-black/50 rounded-full p-1 border border-white/15`}>
                  <Pressable
                    onPress={() => switchMode('photo')}
                    disabled={recording}
                    style={[tw`px-5 py-2 rounded-full`, mode === 'photo' ? tw`bg-white` : tw`bg-transparent`]}
                  >
                    <Text style={tw`text-xs font-bold ${mode === 'photo' ? 'text-black' : 'text-white/80'}`}>
                      Photo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchMode('video')}
                    disabled={recording}
                    style={[tw`px-5 py-2 rounded-full`, mode === 'video' ? tw`bg-white` : tw`bg-transparent`]}
                  >
                    <Text style={tw`text-xs font-bold ${mode === 'video' ? 'text-black' : 'text-white/80'}`}>
                      Video
                    </Text>
                  </Pressable>
                </View>

                {!ready || busy ? <ActivityIndicator color="#fff" style={tw`mb-4`} /> : null}

                {mode === 'video' ? (
                  <Pressable
                    onPress={onVideoShutterPress}
                    disabled={!ready || busy}
                    style={[
                      tw`w-[78px] h-[78px] rounded-full items-center justify-center border-4 border-red-500`,
                      recording ? tw`bg-red-500/35` : tw`bg-transparent`,
                    ]}
                  >
                    <View style={recording ? tw`w-8 h-8 bg-red-500 rounded-lg` : tw`w-[62px] h-[62px] rounded-full bg-red-500`} />
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
                      style={
                        recording
                          ? tw`w-8 h-8 bg-red-500 rounded-lg`
                          : tw`w-[62px] h-[62px] rounded-full bg-white`
                      }
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
