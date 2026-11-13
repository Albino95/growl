import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  Text,
  View,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import { usePressFeedback } from '../../hooks/usePressFeedback';
import type { FeedbackKind } from '../../utils/interactionFeedback';

type Props = {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  /** Briefly show a checkmark in place of the label (e.g. after a successful submit). */
  success?: boolean;
  variant?: 'solid' | 'soft' | 'ghost';
  accessibilityLabel?: string;
  /**
   * Feedback on press. Default: 'commit' (light tap + commit tone) for the
   * solid primary variant, a silent selection tick for soft / ghost. Pass a
   * kind to override, or `false` for none (e.g. when onPress fires its own).
   */
  feedback?: FeedbackKind | false;
};

const CROSSFADE_MS = 120;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

function fadeTo(value: Animated.Value, toValue: number) {
  return Animated.timing(value, {
    toValue,
    duration: CROSSFADE_MS,
    easing: EASE_OUT,
    useNativeDriver: true,
  });
}

function PrimaryButton({
  label,
  onPress,
  onLongPress,
  style,
  disabled,
  loading,
  success,
  variant = 'solid',
  accessibilityLabel,
  feedback: feedbackKind,
}: Props) {
  const isDisabled = !!disabled || !!loading || !!success;
  const kind: FeedbackKind | undefined =
    feedbackKind === false ? undefined : (feedbackKind ?? (variant === 'solid' ? 'commit' : 'selection'));
  const feedback = usePressFeedback({ onPress, disabled: isDisabled, kind });
  const baseVariant =
    variant === 'soft'
      ? tw`bg-brand-50 border border-brand-200`
      : variant === 'ghost'
        ? tw`bg-transparent border border-stone-300`
        : tw`bg-brand-600`;
  const labelVariant =
    variant === 'soft' ? tw`text-brand-700` : variant === 'ghost' ? tw`text-ink-2` : tw`text-white`;
  const iconColor = variant === 'solid' ? '#FFFFFF' : theme.colors.ink2;

  // Label stays in layout (opacity only) so the button never changes width while loading.
  const phase: 'label' | 'loading' | 'success' = success ? 'success' : loading ? 'loading' : 'label';
  const labelOpacity = useRef(new Animated.Value(phase === 'label' ? 1 : 0)).current;
  const spinnerOpacity = useRef(new Animated.Value(phase === 'loading' ? 1 : 0)).current;
  const checkOpacity = useRef(new Animated.Value(phase === 'success' ? 1 : 0)).current;
  const checkScale = useRef(new Animated.Value(phase === 'success' ? 1 : 0.6)).current;

  useEffect(() => {
    const anims = [
      fadeTo(labelOpacity, phase === 'label' ? 1 : 0),
      fadeTo(spinnerOpacity, phase === 'loading' ? 1 : 0),
      fadeTo(checkOpacity, phase === 'success' ? 1 : 0),
    ];
    if (phase === 'success') {
      checkScale.setValue(0.6);
      anims.push(
        Animated.spring(checkScale, {
          toValue: 1,
          damping: 12,
          stiffness: 260,
          mass: 1,
          useNativeDriver: true,
        })
      );
    }
    const anim = Animated.parallel(anims);
    anim.start();
    return () => anim.stop();
  }, [phase, labelOpacity, spinnerOpacity, checkOpacity, checkScale]);

  return (
    <Pressable
      onPress={feedback.onPress}
      onPressIn={feedback.onPressIn}
      onPressOut={feedback.onPressOut}
      onLongPress={isDisabled ? undefined : onLongPress}
      delayLongPress={420}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      style={[
        tw`px-4 py-3.5 rounded-card items-center justify-center min-h-[50px]`,
        baseVariant,
        !!disabled && !loading && !success && tw`opacity-50`,
        style,
      ]}
    >
      <Animated.View style={feedback.animatedStyle}>
        <Animated.View style={{ opacity: labelOpacity }}>
          <Text style={[tw`text-callout font-semibold text-center`, labelVariant]}>{label}</Text>
        </Animated.View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, tw`items-center justify-center`]}>
          <Animated.View style={{ opacity: spinnerOpacity }}>
            {loading ? (
              <ActivityIndicator size="small" color={iconColor} />
            ) : null}
          </Animated.View>
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, tw`items-center justify-center`]}>
          <Animated.View style={{ opacity: checkOpacity, transform: [{ scale: checkScale }] }}>
            <Ionicons name="checkmark" size={22} color={iconColor} />
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default React.memo(PrimaryButton);
