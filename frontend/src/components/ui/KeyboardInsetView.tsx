import React, { useRef } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';

type Props = {
  /** Outer, full-size wrapper (backdrop colour etc.). Keeps its full height. */
  style?: StyleProp<ViewStyle>;
  /** Inner column that gets `paddingBottom = keyboard overlap` on iOS. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Bottom padding to use while the keyboard is hidden (e.g. safe-area inset). */
  restingBottom?: number;
  children: React.ReactNode | ((keyboardInset: number) => React.ReactNode);
};

/**
 * Drop-in replacement for `<KeyboardAvoidingView behavior="padding">` in
 * transparent bottom-sheet Modals and pageSheet/formSheet screens. It lifts its
 * content by the keyboard's real on-screen overlap (useKeyboardInset), which
 * KeyboardAvoidingView mis-computes inside sheets. Android is a no-op: the
 * window resizes (softwareKeyboardLayoutMode "resize").
 */
export default function KeyboardInsetView({ style, contentStyle, restingBottom = 0, children }: Props) {
  const ref = useRef<View>(null);
  const inset = useKeyboardInset(ref);
  const pad = Platform.OS === 'ios' && inset > 0 ? inset : restingBottom;
  return (
    <View ref={ref} collapsable={false} style={[{ flex: 1 }, style]}>
      <View style={[{ flex: 1 }, contentStyle, { paddingBottom: pad }]} pointerEvents="box-none">
        {typeof children === 'function' ? children(inset) : children}
      </View>
    </View>
  );
}
