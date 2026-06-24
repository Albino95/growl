import { Platform, Vibration } from 'react-native';
import { useUiPrefsStore } from '../state/useUiPrefsStore';

let webAudioCtx: any = null;

function playWebClickTone() {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;
  webAudioCtx = webAudioCtx || new AudioCtx();
  const ctx = webAudioCtx;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(680, ctx.currentTime);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.065);
}

export function triggerPressFeedback() {
  const { hapticsEnabled, soundEnabled } = useUiPrefsStore.getState();
  if (hapticsEnabled && Platform.OS !== 'web') {
    Vibration.vibrate(8);
  }
  if (soundEnabled && Platform.OS === 'web') {
    playWebClickTone();
  }
}
