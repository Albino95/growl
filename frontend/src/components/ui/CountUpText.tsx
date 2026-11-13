import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useCountUp } from '../../hooks/useCountUp';

type Props = Omit<TextProps, 'children'> & {
  value: number;
  /** Rendered before / after the animated number (e.g. "🔥 ", "+", " pts"). */
  prefix?: string;
  suffix?: string;
  /** Start value on first mount (default 0). */
  from?: number;
  delay?: number;
};

/**
 * A number that counts up to `value` (motion.easing.out, duration.slow) and
 * animates from the current value when it changes. Jumps under Reduce Motion.
 */
export default function CountUpText({ value, prefix = '', suffix = '', from, delay, ...rest }: Props) {
  const shown = useCountUp(value, { from, delay });
  return (
    <Text {...rest}>
      {prefix}
      {shown}
      {suffix}
    </Text>
  );
}
