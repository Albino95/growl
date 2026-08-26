import { Platform } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';

export type FrameThumb = {
  uri: string;
  timeMs: number;
  /** True when this is a drawn placeholder, not a real video frame. */
  placeholder?: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise
      .then((v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      });
  });
}

function makePlaceholderDataUri(label: string, tone: number): string {
  // Tiny SVG data URI — works on web + RN Image
  const bg = tone % 2 === 0 ? '#44403C' : '#292524';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64">
    <rect width="80" height="64" fill="${bg}"/>
    <text x="40" y="36" text-anchor="middle" fill="#A8A29E" font-size="11" font-family="sans-serif">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildPlaceholders(durationMs: number, count: number): FrameThumb[] {
  const duration = Math.max(durationMs, 1000);
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : Math.round((i / (count - 1)) * Math.max(0, duration - 40));
    const sec = Math.floor(t / 1000);
    return {
      uri: makePlaceholderDataUri(`${sec}s`, i),
      timeMs: t,
      placeholder: true,
    };
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    let doneOnce = false;
    const finish = () => {
      if (doneOnce) return;
      doneOnce = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    if (Math.abs((video.currentTime || 0) - timeSec) < 0.04) {
      finish();
      return;
    }
    video.addEventListener('seeked', finish);
    try {
      video.currentTime = timeSec;
    } catch {
      finish();
      return;
    }
    setTimeout(finish, 700);
  });
}

async function waitForVideoReady(video: HTMLVideoElement): Promise<boolean> {
  if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
    return true;
  }
  return withTimeout(
    new Promise<boolean>((resolve) => {
      const ok = () => resolve(true);
      const bad = () => resolve(false);
      video.addEventListener('loadeddata', ok, { once: true });
      video.addEventListener('canplay', ok, { once: true });
      video.addEventListener('error', bad, { once: true });
      // Kick decode on some browsers
      void video.play().then(() => {
        video.pause();
        resolve(true);
      }).catch(() => {
        /* wait for events */
      });
    }),
    5000,
    false
  );
}

async function extractFramesWeb(
  videoUri: string,
  durationMs: number,
  count: number
): Promise<FrameThumb[]> {
  if (typeof document === 'undefined') return buildPlaceholders(durationMs, count);

  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  if (/^https?:\/\//i.test(videoUri)) {
    video.crossOrigin = 'anonymous';
  }
  video.src = videoUri;

  const ready = await waitForVideoReady(video);
  if (!ready) {
    video.removeAttribute('src');
    try {
      video.load();
    } catch {
      /* ignore */
    }
    return buildPlaceholders(durationMs, count);
  }

  const mediaDurationMs =
    Number.isFinite(video.duration) && video.duration > 0
      ? video.duration * 1000
      : Math.max(durationMs, 1000);
  const duration = Math.max(mediaDurationMs, durationMs, 1000);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return buildPlaceholders(duration, count);

  const frames: FrameThumb[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * Math.max(0, duration - 120);
    await seekVideo(video, t / 1000);
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (w < 2 || h < 2) continue;
    const maxW = 96;
    const scale = Math.min(1, maxW / w);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ uri: canvas.toDataURL('image/jpeg', 0.6), timeMs: t });
    } catch {
      break;
    }
  }

  video.pause();
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    /* ignore */
  }

  return frames.length > 0 ? frames : buildPlaceholders(duration, count);
}

async function extractFramesNative(
  videoUri: string,
  durationMs: number,
  count: number
): Promise<FrameThumb[]> {
  const duration = Math.max(durationMs, 1000);
  const frames: FrameThumb[] = [];

  // expo-video-thumbnails expects a local file URI on native.
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : Math.round((i / (count - 1)) * Math.max(0, duration - 80));
    try {
      const result = await withTimeout(
        VideoThumbnails.getThumbnailAsync(videoUri, {
          time: Math.max(0, t),
          quality: 0.4,
        }),
        2000,
        null as { uri: string } | null
      );
      if (result?.uri) {
        frames.push({ uri: result.uri, timeMs: t });
      }
    } catch {
      /* skip frame */
    }
  }

  return frames.length >= Math.min(3, count)
    ? frames
    : buildPlaceholders(duration, count);
}

/** Sample evenly spaced preview frames for an Instagram-style trim filmstrip. */
export async function extractVideoFrames(
  videoUri: string,
  durationMs: number,
  count = 10
): Promise<FrameThumb[]> {
  const n = Math.max(6, Math.min(11, count));
  const safeDuration = Math.max(durationMs, 1000);
  if (!videoUri) return buildPlaceholders(safeDuration, n);

  try {
    if (Platform.OS === 'web') {
      return await withTimeout(
        extractFramesWeb(videoUri, safeDuration, n),
        10000,
        buildPlaceholders(safeDuration, n)
      );
    }
    return await withTimeout(
      extractFramesNative(videoUri, safeDuration, n),
      12000,
      buildPlaceholders(safeDuration, n)
    );
  } catch {
    return buildPlaceholders(safeDuration, n);
  }
}
