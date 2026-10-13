import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tw from '../../lib/tw';
import { feedback } from '../../utils/interactionFeedback';

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
 * Shared cream bottom sheet — dim backdrop + spring slide for enter/exit feel.
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
  const closing = useRef(false);
  const maxH = Dimensions.get('window').height * maxHeightRatio;

  useEffect(() => {
    if (!visible) {
      closing.current = false;
      backdrop.setValue(0);
      sheetY.setValue(48);
      return;
    }
    closing.current = false;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 18,
        bounciness: 7,
      }),
    ]).start();
  }, [visible, backdrop, sheetY]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (closeFeedback) feedback.close();
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: 36,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
      closing.current = false;
    });
  }, [backdrop, sheetY, onClose, closeFeedback]);

  const body = typeof children === 'function' ? children({ close }) : children;

  const sheet = (
    <Animated.View
      style={[
        tw`bg-[#FFFcf7] rounded-t-3xl border-t border-stone-200 w-full overflow-hidden`,
        {
          maxHeight: maxH,
          paddingBottom: Math.max(insets.bottom, 12),
          transform: [{ translateY: sheetY }],
        },
        sheetStyle,
      ]}
    >
      <View style={tw`w-10 h-1 rounded-full bg-stone-300 self-center mt-3 mb-2`} />
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
