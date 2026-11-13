import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  PanResponder,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';
import { haptic } from '../../theme/haptics';
import { duration, easing, spring, timing } from '../../theme/motion';
import { getReducedMotion } from '../../hooks/useReducedMotion';

/** Drag distance (pt) past which releasing dismisses the sheet. */
const DISMISS_DY = 72;

type CloseApi = { close: () => void };

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode | ((api: CloseApi) => React.ReactNode);
  /** Max height as fraction of screen (default 0.88). */
  maxHeightRatio?: number;
  /** Avoid keyboard covering inputs. */
  keyboardAware?: boolean;
  /** Sheet container style overrides. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Fire close feedback when dismissing. */
  closeFeedback?: boolean;
};

/**
 * Shared cream bottom sheet — dim backdrop, spring enter, drag-down to close.
 */
export default function AnimatedBottomSheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.88,
  keyboardAware = false,
  sheetStyle,
  closeFeedback = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(48)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  const closeFeedbackRef = useRef(closeFeedback);
  onCloseRef.current = onClose;
  closeFeedbackRef.current = closeFeedback;
  const maxH = Dimensions.get('window').height * maxHeightRatio;
  /** True once the current drag has crossed the dismiss threshold (one haptic per drag). */
  const pastThreshold = useRef(false);

  const resetPose = useCallback(() => {
    closing.current = false;
    backdrop.setValue(0);
    sheetY.setValue(48);
    dragY.setValue(0);
  }, [backdrop, sheetY, dragY]);

  useEffect(() => {
    if (!visible) {
      resetPose();
      return;
    }
    closing.current = false;
    dragY.setValue(0);
    haptic('tapLight');
    const r = getReducedMotion();
    if (r) sheetY.setValue(0);
    Animated.parallel([
      timing(backdrop, 1, { duration: duration.base, easing: easing.out }, r),
      spring(sheetY, 0, 'gentle', r),
    ]).start();
  }, [visible, backdrop, sheetY, dragY, resetPose]);

  const runClose = useCallback(
    (fromDrag: boolean) => {
      if (closing.current) return;
      closing.current = true;
      if (closeFeedbackRef.current) feedback.close();
      const r = getReducedMotion();
      Animated.parallel([
        timing(backdrop, 0, { duration: duration.quick, easing: easing.in }, r),
        timing(
          fromDrag ? dragY : sheetY,
          fromDrag ? 440 : 40,
          { duration: duration.base, easing: easing.in },
          r
        ),
      ]).start(({ finished }) => {
        if (finished) onCloseRef.current();
        closing.current = false;
      });
    },
    [backdrop, sheetY, dragY]
  );

  const close = useCallback(() => runClose(false), [runClose]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pastThreshold.current = false;
        dragY.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        const next = Math.max(0, g.dy);
        dragY.setValue(next);
        backdrop.setValue(Math.max(0.06, 1 - next / 360));
        // A single tick per drag when it first crosses "release to close".
        if (next > DISMISS_DY && !pastThreshold.current) {
          pastThreshold.current = true;
          haptic('impactMedium');
        }
      },
      onPanResponderRelease: (_, g) => {
        pastThreshold.current = false;
        if (g.dy > DISMISS_DY || g.vy > 1.05) {
          runClose(true);
          return;
        }
        const r = getReducedMotion();
        Animated.parallel([
          spring(dragY, 0, 'snappy', r),
          timing(backdrop, 1, { duration: duration.quick }, r),
        ]).start();
      },
    })
  ).current;

  const body = typeof children === 'function' ? children({ close }) : children;
  const translateY = Animated.add(sheetY, dragY);

  const sheet = (
    <Animated.View
      style={[
        tw`bg-card rounded-t-sheet border-t border-line w-full overflow-hidden`,
        {
          maxHeight: maxH,
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY }],
        },
        sheetStyle,
      ]}
    >
      <View
        {...pan.panHandlers}
        style={tw`pt-3 pb-2 items-center`}
        accessibilityRole="adjustable"
        accessibilityLabel="Swipe down to close"
      >
        <View style={tw`w-12 h-1.5 rounded-chip bg-stone-400`} />
      </View>
      {body}
    </Animated.View>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={tw`flex-1 justify-end`}>
        <Animated.View
          pointerEvents="none"
          style={[
            tw`absolute inset-0 bg-black`,
            {
              opacity: backdrop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              }),
            },
          ]}
        />
        <Pressable style={tw`absolute inset-0`} onPress={close} accessibilityLabel="Dismiss" />
        {keyboardAware ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={tw`justify-end`}
            pointerEvents="box-none"
          >
            {sheet}
          </KeyboardAvoidingView>
        ) : (
          sheet
        )}
      </View>
    </Modal>
  );
}
