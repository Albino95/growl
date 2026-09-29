import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { useUiPrefsStore } from '../state/useUiPrefsStore';

let webAudioCtx: any = null;
let nativeClick: Audio.Sound | null = null;
let nativeClickLoading: Promise<void> | null = null;

function playWebClickTone() {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  webAudioCtx = webAudioCtx || new AudioCtx();
  const ctx = webAudioCtx;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
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

async function ensureNativeClick() {
  if (nativeClick) return;
  if (nativeClickLoading) {
    await nativeClickLoading;
    return;
  }
  nativeClickLoading = (async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../assets/sounds/click.wav'),
        { shouldPlay: false, volume: 0.35 }
      );
      nativeClick = sound;
    } catch {
      nativeClick = null;
    } finally {
      nativeClickLoading = null;
    }
  })();
  await nativeClickLoading;
}

async function playNativeClickTone() {
  try {
    await ensureNativeClick();
    if (!nativeClick) return;
    await nativeClick.setPositionAsync(0);
    await nativeClick.playAsync();
  } catch {
    /* ignore */
  }
}

export function triggerPressFeedback() {
  const { hapticsEnabled, soundEnabled } = useUiPrefsStore.getState();
  if (hapticsEnabled && Platform.OS !== 'web') {
    Vibration.vibrate(8);
  }
  if (!soundEnabled) return;
  if (Platform.OS === 'web') {
    playWebClickTone();
    return;
  }
  void playNativeClickTone();
}
