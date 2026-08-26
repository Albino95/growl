import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

export type FrameThumb = {
  uri: string;
  timeMs: number;
};

async function extractFramesWeb(
  videoUri: string,
  durationMs: number,
  count: number
): Promise<FrameThumb[]> {
  if (typeof document === 'undefined') return [];

  const video = document.createElement('video');
  video.src = videoUri;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Same-origin / blob URIs work; remote may taint canvas.
  try {
    video.crossOrigin = 'anonymous';
  } catch {
    // ignore
  }

  await new Promise<void>((resolve, reject) => {
    const onReady = () => resolve();
    const onErr = () => reject(new Error('Could not load video for frames'));
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onErr, { once: true });
  });

  const duration = Math.max(durationMs, (video.duration || 1) * 1000);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const frames: FrameThumb[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * Math.max(0, duration - 40);
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = t / 1000;
    });
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 180;
    const maxW = 120;
    const scale = Math.min(1, maxW / w);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      frames.push({ uri: canvas.toDataURL('image/jpeg', 0.55), timeMs: t });
    } catch {
      // tainted canvas
      break;
    }
  }

  video.src = '';
  return frames;
}

async function extractFramesNative(
  videoUri: string,
  durationMs: number,
  count: number
): Promise<FrameThumb[]> {
  const duration = Math.max(durationMs, 1000);
  const frames: FrameThumb[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : Math.round((i / (count - 1)) * Math.max(0, duration - 80));
    try {
      const result = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: t,
        quality: 0.45,
      });
      frames.push({ uri: result.uri, timeMs: t });
    } catch {
      // skip failed frame
    }
  }
  return frames;
}

/** Sample evenly spaced preview frames for an Instagram-style trim filmstrip. */
export async function extractVideoFrames(
  videoUri: string,
  durationMs: number,
  count = 10
): Promise<FrameThumb[]> {
  const n = Math.max(4, Math.min(14, count));
  try {
    if (Platform.OS === 'web') {
      return await extractFramesWeb(videoUri, durationMs, n);
    }
    return await extractFramesNative(videoUri, durationMs, n);
  } catch {
    return [];
  }
}
