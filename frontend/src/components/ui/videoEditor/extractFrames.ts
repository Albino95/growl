import { Platform } from 'react-native';
// Type-only: the native module itself is still loaded lazily below.
import type { VideoPlayer } from 'expo-video';
import {
  nativeMayGenerateThumbnails,
  nativeSampleQuietMs,
  nativeThumbnailReleaseMs,
  waitMs,
} from './videoEditorPolicy';

export type FrameThumb = {
  uri: string;
  timeMs: number;
  /** True when this is a drawn placeholder, not a real video frame. */
  placeholder?: boolean;
  /** expo-image source (VideoThumbnail SharedRef or { uri }). */
  source?: unknown;
};

export function frameImageSource(frame: FrameThumb | null | undefined): unknown {
  if (!frame || frame.placeholder) return null;
  if (frame.source) return frame.source;
  if (frame.uri) return { uri: frame.uri };
  return null;
}

export function stillSourceFromFrames(frames: FrameThumb[]): unknown {
  for (const f of frames) {
    const src = frameImageSource(f);
    if (src) return src;
  }
  return null;
}

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

export function frameCountForDuration(durationMs: number): number {
  const duration = Math.max(durationMs, 1000);
  return Math.max(8, Math.min(10, Math.round(duration / 1000)));
}

const frameCache = new Map<string, FrameThumb[]>();

export function clearFrameCache(): void {
  frameCache.clear();
}

export function stillFromFrames(frames: FrameThumb[]): string | null {
  const f = frames.find((x) => frameImageSource(x));
  if (!f) return null;
  return f.uri || null;
}

export function nearestFrame(frames: FrameThumb[], timeMs: number): FrameThumb | null {
  const real = frames.filter((f) => Boolean(frameImageSource(f)));
  if (real.length === 0) return null;
  let best = real[0];
  let bestD = Math.abs(best.timeMs - timeMs);
  for (const f of real) {
    const d = Math.abs(f.timeMs - timeMs);
    if (d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

export function clampThumbnailTimeMs(timeMs: number, durationMs: number): number {
  const duration = Math.max(durationMs, 1000);
  return Math.min(Math.max(80, timeMs), Math.max(80, duration - 80));
}

export function remapFrameTimes(frames: FrameThumb[], durationMs: number): FrameThumb[] {
  const duration = Math.max(durationMs, 1000);
  const n = frames.length;
  if (n === 0) return frames;
  return frames.map((f, i) => ({
    ...f,
    timeMs: n === 1 ? 0 : Math.round((i / (n - 1)) * Math.max(0, duration - 40)),
  }));
}

export function buildPlaceholders(durationMs: number, count: number): FrameThumb[] {
  const duration = Math.max(durationMs, 1000);
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : Math.round((i / (n - 1)) * Math.max(0, duration - 40));
    return {
      uri: '',
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
      void video
        .play()
        .then(() => {
          video.pause();
          resolve(true);
        })
        .catch(() => {
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
  count: number,
  onProgress?: (frames: FrameThumb[]) => void
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

  const frames = buildPlaceholders(duration, count);
  onProgress?.(frames.slice());

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * Math.max(0, duration - 80);
    await seekVideo(video, t / 1000);
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (w < 2 || h < 2) continue;
    const maxW = 80;
    const scale = Math.min(1, maxW / w);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames[i] = { uri: canvas.toDataURL('image/jpeg', 0.55), timeMs: t };
      onProgress?.(frames.slice());
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

  return frames.some((f) => !f.placeholder) ? frames : buildPlaceholders(duration, count);
}

async function copyClipForThumbs(uri: string): Promise<string> {
  try {
    const FileSystem = await import('expo-file-system/legacy');
    const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!dir) return '';
    const dest = `${dir}grow-thumbs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch {
    return '';
  }
}

async function deleteQuiet(uri: string): Promise<void> {
  if (!uri) return;
  try {
    const FileSystem = await import('expo-file-system/legacy');
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

function waitPlayerReady(
  player: VideoPlayer,
  ms: number
): Promise<boolean> {
  if (player.status === 'readyToPlay') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        sub.remove();
      } catch {
        /* ignore */
      }
      resolve(player.status === 'readyToPlay');
    }, ms);
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'readyToPlay' && status !== 'error') return;
      clearTimeout(timer);
      try {
        sub.remove();
      } catch {
        /* ignore */
      }
      resolve(status === 'readyToPlay');
    });
  });
}

/**
 * Native stills via expo-video on a *copy* of the clip. Never uses
 * expo-video-thumbnails (AVAssetImageGenerator SIGABRTs). The copy is deleted
 * and the player released before any VideoView may mount on the original URI.
 */
async function extractFramesNative(
  videoUri: string,
  durationMs: number,
  count: number,
  onProgress?: (frames: FrameThumb[]) => void
): Promise<FrameThumb[]> {
  const n = Math.max(1, Math.min(8, count));
  const frames = buildPlaceholders(durationMs, n);
  onProgress?.(frames.slice());
  if (!videoUri) return frames;

  const thumbsUri = await copyClipForThumbs(videoUri);
  if (!thumbsUri) return frames;

  let player: VideoPlayer | null = null;

  try {
    const ExpoVideo = await import('expo-video');
    const p = ExpoVideo.createVideoPlayer(null);
    player = p;
    await withTimeout(
      p.replaceAsync({ uri: thumbsUri, contentType: 'auto' }).then(() => true),
      8000,
      false
    );
    const ready = await waitPlayerReady(p, 8000);
    if (!ready) return frames;

    const duration = Math.max(durationMs, 1000);
    const times = frames.map((f) => clampThumbnailTimeMs(f.timeMs, duration) / 1000);
    const thumbs = await withTimeout(
      p.generateThumbnailsAsync(times, { maxWidth: 72, maxHeight: 96 }),
      10000,
      []
    );

    for (let i = 0; i < Math.min(n, thumbs.length); i += 1) {
      const thumb = thumbs[i] as { uri?: string } | null;
      if (!thumb) continue;
      const uri = typeof thumb.uri === 'string' && thumb.uri ? thumb.uri : '';
      frames[i] = {
        uri,
        timeMs: frames[i].timeMs,
        placeholder: false,
        source: thumb,
      };
      onProgress?.(frames.slice());
    }
  } catch {
    return buildPlaceholders(durationMs, n);
  } finally {
    try {
      player?.pause();
    } catch {
      /* ignore */
    }
    try {
      player?.release?.();
    } catch {
      /* ignore */
    }
    await deleteQuiet(thumbsUri);
  }

  return frames.some((f) => Boolean(frameImageSource(f)))
    ? frames
    : buildPlaceholders(durationMs, n);
}

/** Sample frames along the clip so the filmstrip can snap trim handles to a real frame. */
export async function extractVideoFrames(
  videoUri: string,
  durationMs: number,
  count = 24,
  onProgress?: (frames: FrameThumb[]) => void
): Promise<FrameThumb[]> {
  const n = Math.max(8, Math.min(14, count));
  const safeDuration = Math.max(durationMs, 1000);
  if (!videoUri) return buildPlaceholders(safeDuration, n);

  try {
    if (Platform.OS === 'web') {
      return await withTimeout(
        extractFramesWeb(videoUri, safeDuration, n, onProgress),
        Math.min(28000, 900 + n * 700),
        buildPlaceholders(safeDuration, n)
      );
    }
    if (!nativeMayGenerateThumbnails()) {
      const frames = buildPlaceholders(safeDuration, n);
      onProgress?.(frames.slice());
      return frames;
    }
    return extractFramesNative(videoUri, safeDuration, n, onProgress);
  } catch {
    return buildPlaceholders(safeDuration, n);
  }
}

/** Sample stills. Native callers must have no AVPlayer mounted on this URI. */
export async function sampleClipFrames(
  videoUri: string,
  durationMs: number,
  onProgress?: (frames: FrameThumb[]) => void
): Promise<FrameThumb[]> {
  const count = frameCountForDuration(durationMs);
  if (!videoUri) {
    const frames = buildPlaceholders(durationMs, count);
    onProgress?.(frames.slice());
    return frames;
  }
  const key = `${videoUri}:${count}:${Math.round(Math.max(durationMs, 0) / 250)}`;
  const cached = frameCache.get(key);
  if (cached && cached.some((f) => Boolean(frameImageSource(f)))) return cached;
  const frames = await extractVideoFrames(videoUri, durationMs, count, onProgress);
  if (frames.some((f) => Boolean(frameImageSource(f)))) frameCache.set(key, frames);
  return frames;
}

/** Unmount players first. Waits, samples, waits again so a player may mount later. */
export async function sampleClipFramesQuiet(
  videoUri: string,
  durationMs: number,
  onProgress?: (frames: FrameThumb[]) => void
): Promise<FrameThumb[]> {
  if (Platform.OS !== 'web' && !nativeMayGenerateThumbnails()) {
    return sampleClipFrames(videoUri, durationMs, onProgress);
  }
  await waitMs(nativeSampleQuietMs());
  const frames = await sampleClipFrames(videoUri, durationMs, onProgress);
  await waitMs(nativeThumbnailReleaseMs());
  return frames;
}
