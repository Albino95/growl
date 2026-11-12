import { Platform } from 'react-native';

/**
 * Soundtrack playback (editor preview + feed/reel playback) only exists on web
 * today. Native builds hide music pickers rather than letting users attach a
 * track they can never hear.
 */
export const MUSIC_PLAYBACK_SUPPORTED = Platform.OS === 'web';
