import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tw, { theme } from '../../lib/tw';
import PressableScale from '../ui/PressableScale';
import { haptic } from '../../theme/haptics';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  IDLE_TIMER,
  focusMinutes,
  formatClock,
  pauseTimer,
  startTimer,
  timerElapsedMs,
  timerRunning,
  type FocusTimerState,
} from './proofDefaults';

type Props = {
  state: FocusTimerState;
  onChange: (next: FocusTimerState) => void;
  disabled?: boolean;
};

/**
 * In-app focus timer. Time comes from timestamps (start/pause), so it keeps
 * counting while the app is in the background; the display only re-renders
 * once a second while visible. Reduce Motion → no pulsing dot.
 */
export default function FocusTimer({ state, onChange, disabled }: Props) {
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const running = timerRunning(state);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!running) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [running]);

  useEffect(() => {
    if (!running || reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [running, reduceMotion, pulse]);

  // `now` re-renders once a second while running; read the clock fresh for accuracy.
  const elapsed = timerElapsedMs(state, running ? Date.now() : now);
  const minutes = focusMinutes(elapsed);
  const started = running || state.accumulatedMs > 0;

  const onStart = () => {
    haptic('impactMedium');
    const at = Date.now();
    setNow(at);
    onChange(startTimer(state, at));
  };
  const onPause = () => {
    haptic('selection');
    const at = Date.now();
    setNow(at);
    onChange(pauseTimer(state, at));
  };
  const onReset = () => {
    haptic('selection');
    onChange(IDLE_TIMER);
  };

  return (
    <View style={tw`items-center py-2`}>
      <View style={tw`flex-row items-center`}>
        {running ? (
          <Animated.View style={[tw`w-2.5 h-2.5 rounded-full bg-emerald-600 mr-2`, { opacity: pulse }]} />
        ) : null}
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`Focus time ${formatClock(elapsed)}`}
          style={[tw`text-[44px] font-bold text-ink`, { fontVariant: ['tabular-nums'] }]}
        >
          {formatClock(elapsed)}
        </Text>
      </View>
      <Text style={tw`text-footnote text-ink-3 mt-1`}>
        {!started
          ? 'Start when you begin — it keeps counting if you leave the app.'
          : running
            ? 'Focusing… pause anytime.'
            : minutes > 0
              ? `${minutes} min ready to save`
              : 'A little longer — at least 30 seconds.'}
      </Text>
      <View style={tw`flex-row gap-2 mt-3`}>
        {running ? (
          <PressableScale
            onPress={onPause}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Pause timer"
            style={tw`flex-row items-center px-5 py-2.5 rounded-control bg-raised`}
          >
            <Ionicons name="pause" size={16} color={theme.colors.ink} style={tw`mr-1.5`} />
            <Text style={tw`text-body font-semibold text-ink`}>Pause</Text>
          </PressableScale>
        ) : (
          <PressableScale
            onPress={onStart}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={started ? 'Resume timer' : 'Start timer'}
            style={tw`flex-row items-center px-5 py-2.5 rounded-control bg-emerald-600`}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={tw`mr-1.5`} />
            <Text style={tw`text-body font-semibold text-white`}>{started ? 'Resume' : 'Start'}</Text>
          </PressableScale>
        )}
        {started && !running ? (
          <PressableScale
            onPress={onReset}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Reset timer"
            style={tw`px-4 py-2.5 rounded-control bg-raised`}
          >
            <Text style={tw`text-body font-semibold text-ink-2`}>Reset</Text>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}
