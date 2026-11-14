import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { haptic } from '../../../theme/haptics';
import { breathe } from '../../../theme/motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { alertMessage } from '../../../utils/confirmDialog';
import { showPermissionDenied } from '../../../utils/permissionPrompt';

export type ReelCaptureResult = {
  uri: string;
  kind: 'image' | 'video';
  mimeType?: string;
  durationMs?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (result: ReelCaptureResult) => void;
};

type CaptureMode = 'photo' | 'video';

const HOLD_MS = 280;
const MAX_VIDEO_SEC = 60;
const MAX_RECORD_BYTES = 38 * 1024 * 1024;

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
  const reducedMotion = useReducedMotion();
  const recDot = useRef(new Animated.Value(1)).current;

  // Recording dot breathes while recording (static under Reduce Motion).
  useEffect(() => {
    recDot.setValue(1);
    if (!recording) return;
    const loop = breathe(recDot, 1, 0.3, {}, reducedMotion);
    loop?.start();
    return () => {
      loop?.stop();
      recDot.setValue(1);
    };
  }, [recording, reducedMotion, recDot]);
  const [busy, setBusy] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  // Web camera stream
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);

  const recordStartedAt = useRef(0);
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
      await showPermissionDenied('camera', {
        canAskAgain: cam?.canAskAgain,
        message: 'Allow camera access to capture a reel.',
      });
      return false;
    }
    return true;
  };

  // Native records muted when the mic is denied instead of failing the capture.
  const micGranted = micPerm?.granted === true;
  const recordMuted = !isWeb && !micGranted;
  const micNoticeShown = useRef(false);

  /**
   * Camera + microphone check right before recording. Returns whether to go
   * ahead; a denied mic still records (muted), only a denied camera stops it.
   */
  const ensureRecordPermissions = async (): Promise<boolean> => {
    if (isWeb) return true;
    let cam = camPerm;
    if (!cam?.granted) {
      cam = await requestCamPerm();
    }
    if (!cam?.granted) {
      await showPermissionDenied('camera', {
        canAskAgain: cam?.canAskAgain,
        message: 'Allow camera access to record a reel.',
      });
      return false;
    }
    let mic = micPerm;
    if (!mic?.granted && mic?.canAskAgain !== false) {
      mic = await requestMicPerm();
      if (mic?.granted) {
        // Let CameraView pick up mute={false} before recordAsync starts.
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!mic?.granted && !micNoticeShown.current) {
      micNoticeShown.current = true;
      await showPermissionDenied('microphone', {
        canAskAgain: mic?.canAskAgain,
        message: 'Your video will be recorded without sound. Allow microphone access to add sound.',
      });
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
        const video = { facingMode: facing === 'front' ? 'user' : 'environment' };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        } catch {
          // Mic blocked: keep the camera and record without sound.
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        webStreamRef.current = stream;
        const previewEl = webVideoRef.current;
        if (previewEl) {
          previewEl.srcObject = stream;
          previewEl.muted = true;
          await previewEl.play();
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
    // Record start: one medium impact (the hold/tap that started it was silent).
    haptic('impactMedium');
    recordingRef.current = true;
    recordStartedAt.current = Date.now();
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

    if (!isWeb) {
      const needsPrompt = !camPerm?.granted || (!micGranted && !micNoticeShown.current);
      const ok = await ensureRecordPermissions();
      if (!ok) return;
      // A permission dialog interrupts a hold-to-record press: don't start a
      // recording nobody is holding; the next press records normally.
      if (needsPrompt && !fromTapMode && !pressActive.current) return;
      if (recordingRef.current) return;
    }

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
              durationMs: Math.max(0, Date.now() - recordStartedAt.current),
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
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_SEC,
        // Stop just under the API's 40MB limit so a recorded reel always uploads.
        maxFileSize: MAX_RECORD_BYTES,
      });
      finishRecordingUi();
      if (result?.uri) {
        onCaptured({
          uri: result.uri,
          kind: 'video',
          mimeType: 'video/mp4',
          durationMs: Math.max(0, Date.now() - recordStartedAt.current),
        });
      }
    } catch (e) {
      finishRecordingUi();
      const msg = e instanceof Error ? e.message : 'Could not record video';
      await alertMessage('Camera', msg);
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    haptic('tapLight');

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
    if (next !== mode) haptic('selection');
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
              accessibilityRole="button"
              style={tw`bg-brand-600 px-6 py-3.5 rounded-full mt-6`}
            >
              <Text style={tw`text-white font-bold`}>Allow camera</Text>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button" style={tw`mt-4 py-2`}>
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
                mute={recordMuted}
                // 720p keeps a 60s reel near the 40MB upload cap (1080p is 2-3x larger).
                videoQuality="720p"
                onCameraReady={() => setReady(true)}
              />
            )}

            <SafeAreaView style={tw`flex-1`} pointerEvents="box-none">
              <View style={tw`flex-row items-center justify-between px-4 pt-2`}>
                <Pressable
                  hitSlop={4}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close camera"
                  style={tw`w-10 h-10 rounded-full bg-black/45 items-center justify-center`}
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
                {recording ? (
                  <View style={tw`flex-row items-center bg-red-600/90 px-3 py-1.5 rounded-full`}>
                    <Animated.View style={[tw`w-2 h-2 rounded-full bg-white mr-2`, { opacity: recDot }]} />
                    <Text style={tw`text-white text-xs font-bold`}>
                      {String(Math.floor(recordSec / 60)).padStart(1, '0')}:
                      {String(recordSec % 60).padStart(2, '0')}
                    </Text>
                  </View>
                ) : (
                  <Text style={tw`text-white/80 text-xs font-semibold`}>{hint}</Text>
                )}
                <Pressable
                  hitSlop={4}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  disabled={recording}
                  accessibilityRole="button"
                  accessibilityLabel={facing === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
                  accessibilityState={{ disabled: recording }}
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
                    accessibilityRole="button"
                    accessibilityLabel="Photo mode"
                    accessibilityState={{ selected: mode === 'photo', disabled: recording }}
                    style={[tw`px-5 py-2 rounded-full`, mode === 'photo' ? tw`bg-white` : tw`bg-transparent`]}
                  >
                    <Text style={tw`text-xs font-bold ${mode === 'photo' ? 'text-black' : 'text-white/80'}`}>
                      Photo
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchMode('video')}
                    disabled={recording}
                    accessibilityRole="button"
                    accessibilityLabel="Video mode"
                    accessibilityState={{ selected: mode === 'video', disabled: recording }}
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
                    accessibilityRole="button"
                    accessibilityLabel={recording ? 'Stop recording' : 'Record'}
                    accessibilityState={{ disabled: !ready || busy }}
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
                    accessibilityRole="button"
                    accessibilityLabel={recording ? 'Stop recording' : 'Take photo'}
                    accessibilityHint={recording ? undefined : 'Hold to record video'}
                    accessibilityState={{ disabled: !ready || busy }}
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
