import type { VideoEditSettings } from '../components/ui/videoEditor/types';
import { normalizeVideoEdit } from '../components/ui/videoEditor/types';
import { getMusicPlaybackUrl } from '../constants/postMusic';

/** Parse video_edit from API metadata (object or JSON string). */
export function parseVideoEdit(raw: unknown): VideoEditSettings | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return normalizeVideoEdit(JSON.parse(raw) as Partial<VideoEditSettings>);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return normalizeVideoEdit(raw as Partial<VideoEditSettings>);
  }
  return null;
}

export function reelSoundtrackFromEdit(edit: VideoEditSettings | null | undefined): {
  audioUrl?: string;
  audioTitle?: string;
} {
  if (!edit) return {};
  const audioUrl = getMusicPlaybackUrl(edit.audioTrackId, edit.audioUrl);
  const audioTitle = edit.audioTitle || undefined;
  if (!audioUrl) return {};
  return { audioUrl, audioTitle };
}

/** Merge top-level metadata audio fields into video_edit for playback. */
export function reelPlaybackSettingsFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): VideoEditSettings | null {
  if (!metadata) return null;
  const edit = parseVideoEdit(metadata.video_edit);
  const metaAudio =
    typeof metadata.audio_url === 'string' ? metadata.audio_url.trim() : '';
  const metaTitle =
    typeof metadata.audio_title === 'string' ? metadata.audio_title.trim() : '';
  if (!edit && !metaAudio) return null;
  return normalizeVideoEdit({
    ...(edit || {}),
    ...(metaAudio && !edit?.audioUrl ? { audioUrl: metaAudio } : {}),
    ...(metaTitle && !edit?.audioTitle ? { audioTitle: metaTitle } : {}),
  });
}
