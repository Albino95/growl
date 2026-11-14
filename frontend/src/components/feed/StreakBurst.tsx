import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { easing } from '../../theme/motion';
import { burstRing } from './streakMilestones';

type Props = {
  /** Change (non-zero) to replay. */
  triggerKey: number;
  delay?: number;
  radius?: number;
};

/**
 * Compact ring of 12 emerald / coral / gold dots bursting outward from the
 * centre of its parent (BadgeCelebrationModal confetti, in miniature). One
 * Animated.Value drives every dot on the native driver. Callers skip it under
 * Reduce Motion.
 */
function StreakBurst({ triggerKey, delay = 0, radius = 34 }: Props) {
  const t = useRef(new Animated.Value(0)).current;
  const dots = useMemo(() => burstRing(12, radius), [radius]);

  useEffect(() => {
    if (!triggerKey) return undefined;
    t.setValue(0);
    const anim = Animated.timing(t, {
      toValue: 1,
      duration: 600,
      delay,
      easing: easing.out,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [triggerKey, delay, t]);

  const opacity = t.interpolate({ inputRange: [0, 0.08, 0.6, 1], outputRange: [0, 1, 1, 0] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.5] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: d.color,
            opacity,
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
              { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy] }) },
              { scale },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });

export default React.memo(StreakBurst);
