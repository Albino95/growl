import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { nativeComposerArmMs } from './videoEditorPolicy';

/**
 * Native AVPlayer must not mount in the same tick as ImagePicker / camera /
 * a previous player tearing down. Web can mount immediately.
 */
export function useDeferredNativePlayer(
  active: boolean,
  opts?: { delayMs?: number; resetKey?: string | null }
): boolean {
  const [armed, setArmed] = useState(Platform.OS === 'web' ? active : false);
  const delayMs = opts?.delayMs ?? nativeComposerArmMs();
  const resetKey = opts?.resetKey;

  useEffect(() => {
    if (!active) {
      setArmed(false);
      return;
    }
    if (Platform.OS === 'web') {
      setArmed(true);
      return;
    }
    setArmed(false);
    const t = setTimeout(() => setArmed(true), delayMs);
    return () => {
      clearTimeout(t);
      setArmed(false);
    };
  }, [active, delayMs, resetKey]);

  return armed;
}
