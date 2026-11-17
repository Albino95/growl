import React, { memo, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import tw from '../../../lib/tw';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

export type EditorSavingOverlayProps = {
  /** Phase text, e.g. "Applying edits…" / "Saving photo…". */
  label: string;
  detail?: string;
  /** Short opacity fade-in; skipped under Reduce Motion. Default true. */
  fadeIn?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Blocking overlay (absolute fill of its parent) with a spinner and phase
 * text. Swallows all touches underneath. Only animates opacity, and not at
 * all when Reduce Motion is on.
 */
function EditorSavingOverlayBase({ label, detail, fadeIn = true, style }: EditorSavingOverlayProps) {
  const reducedMotion = useReducedMotion();
  const animate = fadeIn && !reducedMotion;
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) {
      opacity.setValue(1);
      return;
    }
    const anim = Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [animate, opacity]);

  return (
    <Animated.View
      // Blocks input: the overlay itself is the touch target.
      pointerEvents="auto"
      onStartShouldSetResponder={() => true}
      style={[tw`absolute inset-0 bg-black/60 items-center justify-center`, { opacity, zIndex: 50 }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={detail ? `${label} ${detail}` : label}
      accessibilityLiveRegion="polite"
      accessibilityViewIsModal
    >
      <View style={tw`items-center px-6 py-5 rounded-2xl bg-stone-900/90 border border-stone-700`}>
        <ActivityIndicator size="small" color="#34D399" />
        <Text style={tw`text-white text-sm font-semibold mt-3`}>{label}</Text>
        {detail ? <Text style={tw`text-stone-400 text-[11px] mt-1`}>{detail}</Text> : null}
      </View>
    </Animated.View>
  );
}

export const EditorSavingOverlay = memo(EditorSavingOverlayBase);

/** Back-compat name used by the photo editor for in-stage busy work. */
export const EditorBusyOverlay = EditorSavingOverlay;

export default EditorSavingOverlay;
