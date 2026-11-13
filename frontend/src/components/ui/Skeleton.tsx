import React, { useEffect, useState } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme } from '../../lib/tw';
import { easing, loopPeriod } from '../../theme/motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * One shared shimmer clock for every skeleton on screen: a single native-driver
 * loop (motion.loopPeriod) started when the first bone mounts and stopped when
 * the last one unmounts. All bones sweep in sync, like one light passing over.
 */
const progress = new Animated.Value(0);
let users = 0;
let loop: Animated.CompositeAnimation | null = null;

function acquire() {
  users += 1;
  if (loop) return;
  loop = Animated.loop(
    Animated.timing(progress, {
      toValue: 1,
      duration: loopPeriod,
      easing: easing.standard,
      useNativeDriver: true,
    })
  );
  loop.start();
}

function release() {
  users = Math.max(0, users - 1);
  if (users > 0 || !loop) return;
  loop.stop();
  loop = null;
  progress.setValue(0);
}

type Props = {
  style?: StyleProp<ViewStyle>;
  /** Base bone color (defaults to the cream `subtle` surface). */
  color?: string;
  /** Highlight band color. */
  highlight?: string;
};

/**
 * Loading placeholder "bone". A soft highlight band slides across (translateX
 * on the native driver, plain Views — no gradient lib). Static under Reduce Motion.
 *
 *   <Skeleton style={tw`h-3 w-24 rounded`} />
 */
export default function Skeleton({
  style,
  color = theme.colors.subtle,
  highlight = 'rgba(255,255,255,0.55)',
}: Props) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const animate = !reduced && width > 0;

  useEffect(() => {
    if (!animate) return;
    acquire();
    return release;
  }, [animate]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  };

  const band = Math.max(24, Math.min(140, width * 0.45));

  return (
    <View
      onLayout={onLayout}
      style={[style, styles.bone, { backgroundColor: color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {animate ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.band,
            {
              width: band,
              backgroundColor: highlight,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-band, width],
                  }),
                },
                { skewX: '-12deg' },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bone: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, opacity: 0.9 },
});
