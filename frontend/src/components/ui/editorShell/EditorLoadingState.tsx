import React, { memo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw from '../../../lib/tw';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import { breathe } from '../../../theme/motion';

/** What the editor is preparing — drives the copy only. */
export type EditorSubject = 'photo' | 'clip';

const COPY: Record<
  EditorSubject,
  { title: string; a11y: string; detail: string; failTitle: string; failDetail: string; retryA11y: string }
> = {
  photo: {
    title: 'Preparing your photo…',
    a11y: 'Preparing your photo',
    detail: 'Making a light copy so edits feel instant',
    failTitle: "We couldn't open this photo",
    failDetail: 'It may still be downloading from iCloud. Try again in a moment.',
    retryA11y: 'Try opening the photo again',
  },
  clip: {
    title: 'Preparing your clip…',
    a11y: 'Preparing your clip',
    detail: 'Loading frames so trimming feels instant',
    failTitle: "We couldn't open this clip",
    failDetail: 'It may still be downloading from iCloud. Try again in a moment.',
    retryA11y: 'Try opening the clip again',
  },
};

/** Accepts the photo editor's CropAspect strings ('free', '4:5', '9:16', …). */
function aspectRatio(aspect?: string): number {
  if (!aspect || aspect === 'free') return 4 / 5;
  const [w, h] = aspect.split(':').map(Number);
  return w > 0 && h > 0 ? w / h : 4 / 5;
}

export type EditorLoadingStateProps = {
  status: 'preparing' | 'failed';
  width: number;
  height: number;
  /** Placeholder frame shape, e.g. '4:5' or '9:16'. */
  aspect?: string;
  /** Defaults to 'photo' (backward compatible with the photo editor). */
  subject?: EditorSubject;
  /** Optional override; falls back to the OS Reduce Motion setting. */
  reducedMotion?: boolean;
  onRetry?: () => void;
  onClose?: () => void;
  /** Extra style for the absolute-fill container (e.g. zIndex in the video stage). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Shown in the editor stage while the media is being prepared. The pulse is
 * opacity-only (native driver) and stops entirely under Reduce Motion. While
 * preparing it lets touches through so stage controls (e.g. play/pause) keep
 * working; the failed state is interactive (Try again / Close).
 */
function EditorLoadingStateBase({
  status,
  width,
  height,
  aspect,
  subject = 'photo',
  reducedMotion,
  onRetry,
  onClose,
  style,
}: EditorLoadingStateProps) {
  const osReducedMotion = useReducedMotion();
  const reduce = reducedMotion ?? osReducedMotion;
  const pulse = useRef(new Animated.Value(0.55)).current;
  const copy = COPY[subject];

  useEffect(() => {
    if (reduce || status !== 'preparing') {
      pulse.setValue(0.7);
      return;
    }
    const loop = breathe(pulse, 0.55, 0.95, { period: 1700 }, reduce);
    loop?.start();
    return () => loop?.stop();
  }, [pulse, reduce, status]);

  const ratio = aspectRatio(aspect);
  let boxH = Math.max(1, height * 0.82);
  let boxW = boxH * ratio;
  if (boxW > width * 0.86) {
    boxW = width * 0.86;
    boxH = boxW / ratio;
  }

  return (
    <View
      pointerEvents={status === 'preparing' ? 'none' : 'auto'}
      style={[tw`absolute inset-0 bg-stone-950 items-center justify-center`, style]}
    >
      <Animated.View
        style={[
          tw`absolute rounded-3xl bg-stone-800`,
          { width: boxW, height: boxH, opacity: status === 'preparing' ? pulse : 0.5 },
        ]}
      />
      {status === 'preparing' ? (
        <View
          style={tw`items-center px-6`}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={copy.a11y}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="small" color="#34D399" />
          <Text style={tw`text-white text-sm font-semibold mt-3`}>{copy.title}</Text>
          <Text style={tw`text-stone-400 text-[11px] mt-1 text-center`}>{copy.detail}</Text>
        </View>
      ) : (
        <View style={tw`items-center px-8`} accessibilityLiveRegion="assertive">
          <Ionicons
            name={subject === 'clip' ? 'videocam-outline' : 'image-outline'}
            size={28}
            color="#A8A29E"
          />
          <Text style={tw`text-white text-sm font-semibold mt-3 text-center`}>
            {copy.failTitle}
          </Text>
          <Text style={tw`text-stone-400 text-[11px] mt-1 text-center`}>{copy.failDetail}</Text>
          <View style={tw`flex-row gap-3 mt-4`}>
            {onRetry ? (
              <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel={copy.retryA11y}
                style={tw`px-4 py-2 rounded-full bg-brand-600`}
              >
                <Text style={tw`text-white font-semibold text-sm`}>Try again</Text>
              </Pressable>
            ) : null}
            {onClose ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close editor"
                style={tw`px-4 py-2 rounded-full bg-white/10`}
              >
                <Text style={tw`text-stone-200 font-semibold text-sm`}>Close</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

export const EditorLoadingState = memo(EditorLoadingStateBase);
export default EditorLoadingState;
