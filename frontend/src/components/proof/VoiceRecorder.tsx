import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { showPermissionDenied } from '../../utils/permissionPrompt';
import { ProofAudio } from './ProofMedia';
import { VOICE_MAX_S, VOICE_MIN_S, formatClock, voiceLongEnough } from './proofDefaults';

/** HIGH_QUALITY preset, trimmed for a short voice note: m4a / AAC, mono, 64 kbps (~0.5 MB/min). */
export const VOICE_RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  numberOfChannels: 1,
  bitRate: 64000,
  android: { ...RecordingPresets.HIGH_QUALITY.android, outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { ...RecordingPresets.HIGH_QUALITY.ios },
};

export type VoiceTake = { uri: string; durationMs: number };

type Props = {
  take: VoiceTake | null;
  onTake: (take: VoiceTake | null) => void;
  disabled?: boolean;
};

/**
 * 10–60 s voice note: live timer, auto-stop at 60 s, playback before saving.
 * Microphone permission is asked only when the user taps Record.
 */
export default function VoiceRecorder({ take, onTake, disabled }: Props) {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const rec = useAudioRecorderState(recorder, 200);
  const reduceMotion = useReducedMotion();
  const [hint, setHint] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const stopping = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    try {
      const ms = rec.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) {
        setHint('Couldn’t save that recording. Try again.');
        return;
      }
      if (!voiceLongEnough(ms)) {
        haptic('warning');
        setHint(`A little longer — at least ${VOICE_MIN_S} seconds.`);
        onTake(null);
        return;
      }
      haptic('success');
      setHint(null);
      onTake({ uri, durationMs: Math.min(ms, VOICE_MAX_S * 1000) });
    } catch {
      setHint('Couldn’t save that recording. Try again.');
    } finally {
      stopping.current = false;
    }
  };

  // Auto-stop at the 60 s cap.
  useEffect(() => {
    if (rec.isRecording && rec.durationMillis >= VOICE_MAX_S * 1000) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, rec.durationMillis]);

  useEffect(() => {
    if (!rec.isRecording || reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rec.isRecording, reduceMotion, pulse]);

  // Leaving the Voice tab mid-recording: stop quietly.
  useEffect(
    () => () => {
      try {
        if (recorder.isRecording) void recorder.stop();
      } catch {
        /* already released */
      }
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    },
    [recorder]
  );

  const start = async () => {
    if (starting || disabled) return;
    setStarting(true);
    setHint(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        await showPermissionDenied('microphone', {
          canAskAgain: perm.canAskAgain,
          message: 'Allow microphone access to record a short voice note.',
        });
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      onTake(null);
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptic('impactMedium');
    } catch {
      haptic('error');
      setHint('The microphone isn’t available right now.');
    } finally {
      setStarting(false);
    }
  };

  const recording = rec.isRecording;
  const left = Math.max(0, VOICE_MAX_S * 1000 - rec.durationMillis);

  return (
    <View style={tw`py-2`}>
      {take && !recording ? (
        <View style={tw`px-3 py-3 rounded-card bg-card border border-line/70`}>
          <ProofAudio source={{ uri: take.uri }} durationS={Math.round(take.durationMs / 1000)} />
          <PressableScale
            onPress={() => void start()}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Record again"
            style={tw`flex-row items-center self-start mt-3`}
            hitSlop={8}
          >
            <Ionicons name="refresh" size={14} color={theme.colors.ink3} />
            <Text style={tw`text-footnote font-semibold text-ink-3 ml-1`}>Record again</Text>
          </PressableScale>
        </View>
      ) : (
        <View style={tw`items-center`}>
          <View style={tw`flex-row items-center`}>
            {recording ? (
              <Animated.View style={[tw`w-2.5 h-2.5 rounded-full bg-red-500 mr-2`, { opacity: pulse }]} />
            ) : null}
            <Text
              accessibilityRole="timer"
              style={[tw`text-[40px] font-bold text-ink`, { fontVariant: ['tabular-nums'] }]}
            >
              {formatClock(rec.durationMillis)}
            </Text>
          </View>
          <Text style={tw`text-footnote text-ink-3 mt-1`}>
            {recording
              ? rec.durationMillis < VOICE_MIN_S * 1000
                ? 'Keep going…'
                : `${Math.ceil(left / 1000)} s left`
              : `${VOICE_MIN_S}–${VOICE_MAX_S} seconds. Say what you practised.`}
          </Text>
          <PressableScale
            onPress={() => void (recording ? stop() : start())}
            disabled={disabled || starting}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            style={tw`mt-3 w-16 h-16 rounded-full items-center justify-center ${recording ? 'bg-red-500' : 'bg-emerald-600'}`}
          >
            <Ionicons name={recording ? 'stop' : 'mic'} size={28} color="#FFFFFF" />
          </PressableScale>
        </View>
      )}
      {hint ? <Text style={tw`text-footnote text-ink-3 mt-2 text-center`}>{hint}</Text> : null}
    </View>
  );
}
