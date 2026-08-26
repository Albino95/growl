import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

export type FrameThumb = {
  uri: string;
  timeMs: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    // If already at target, seeked may never fire
    if (Math.abs((video.currentTime || 0) - timeSec) < 0.05) {
      resolve();
      return;
    }
    video.addEventListener('seeked', done);
    try {
      video.currentTime = timeSec;
    } catch {
      resolve();
    }
    setTimeout(done, 900);
  });
}

async function extractFramesWeb(
  videoUri: string,
  durationMs: number,
  count: number
): Promise<FrameThumb[]> {
  if (typeof document === 'undefined') return [];

  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  // Never set crossOrigin on blob:/file: — it can block decoding forever.
  if (/^https?:\/\//i.test(videoUri)) {
    video.crossOrigin = 'anonymous';
  }
  video.src = videoUri;

  const ready = await withTimeout(
    new Promise<boolean>((resolve) => {
      const ok = () => resolve(true);
      const bad = () => resolve(false);
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('error', bad, { once: true });
    }),
    6000,
    false
  );
  if (!ready) {
    video.removeAttribute('src');
    video.load();
    return [];
  }

  const duration = Math.max(
    durationMs > 100 ? durationMs : 0,
    (Number.isFinite(video.duration) ? video.duration : 1) * 1000,
    1000
  );
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const frames: FrameThumb[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * Math.max(0, duration - 120);
    await seekVideo(video, t / 1000);
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 180;
    if (w < 2 || h < 2) continue;
    const maxW = 120;
    const scale = Math.min(1, maxW / w);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ uri: canvas.toDataURL('image/jpeg', 0.55), timeMs: t });
    } catch {
      break;
    }
  }

  video.removeAttribute('src');
  video.load();
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
    const result = await withTimeout(
      VideoThumbnails.getThumbnailAsync(videoUri, {
        time: t,
        quality: 0.45,
      }).then((r) => r as { uri: string } | null),
      2500,
      null
    );
    if (result?.uri) frames.push({ uri: result.uri, timeMs: t });
  }
  return frames;
}

/** Sample evenly spaced preview frames for an Instagram-style trim filmstrip. */
export async function extractVideoFrames(
  videoUri: string,
  durationMs: number,
  count = 10
): Promise<FrameThumb[]> {
  const n = Math.max(4, Math.min(12, count));
  try {
    if (Platform.OS === 'web') {
      return await withTimeout(extractFramesWeb(videoUri, durationMs, n), 12000, []);
    }
    return await withTimeout(extractFramesNative(videoUri, durationMs, n), 15000, []);
  } catch {
    return [];
  }
}
