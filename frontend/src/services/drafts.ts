/**
 * Small on-device draft store (journal entries, post/reel/story composer).
 *
 * The app has no AsyncStorage, so drafts live as JSON files in the document
 * directory via expo-file-system (lazy-imported so tests and web don't load it).
 * The storage backend is injectable — `createDraftStore(memoryDraftBackend())`
 * gives a pure in-memory store for tests.
 *
 * Keys are namespaced per user: `<namespace>:<userId>`.
 */

export type DraftBackend = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

type Envelope<T> = { v: 1; savedAt: number; data: T };

export type LoadedDraft<T> = { data: T; savedAt: number };

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function draftKey(namespace: string, userId: string | null | undefined): string {
  return `${namespace}:${userId || 'anon'}`;
}

export function createDraftStore(backend: DraftBackend, now: () => number = () => Date.now()) {
  return {
    async save<T>(namespace: string, userId: string | null | undefined, data: T): Promise<void> {
      const envelope: Envelope<T> = { v: 1, savedAt: now(), data };
      try {
        await backend.write(draftKey(namespace, userId), JSON.stringify(envelope));
      } catch (e) {
        console.warn('[drafts] save failed', e);
      }
    },

    async load<T>(
      namespace: string,
      userId: string | null | undefined,
      opts: { maxAgeMs?: number } = {}
    ): Promise<LoadedDraft<T> | null> {
      const key = draftKey(namespace, userId);
      let raw: string | null = null;
      try {
        raw = await backend.read(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<Envelope<T>>;
        if (!parsed || parsed.v !== 1 || typeof parsed.savedAt !== 'number' || parsed.data == null) {
          await backend.remove(key).catch(() => undefined);
          return null;
        }
        const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
        if (now() - parsed.savedAt > maxAge) {
          await backend.remove(key).catch(() => undefined);
          return null;
        }
        return { data: parsed.data as T, savedAt: parsed.savedAt };
      } catch {
        await backend.remove(key).catch(() => undefined);
        return null;
      }
    },

    async clear(namespace: string, userId: string | null | undefined): Promise<void> {
      try {
        await backend.remove(draftKey(namespace, userId));
      } catch {
        /* nothing to clear */
      }
    },
  };
}

export type DraftStore = ReturnType<typeof createDraftStore>;

/** In-memory backend (tests, and the fallback when the file system is unavailable). */
export function memoryDraftBackend(): DraftBackend & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    async read(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async write(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}

type LegacyFs = typeof import('expo-file-system/legacy');

let fsPromise: Promise<LegacyFs | null> | null = null;
function loadFs(): Promise<LegacyFs | null> {
  if (!fsPromise) {
    fsPromise = import('expo-file-system/legacy')
      .then((m) => (m && m.documentDirectory ? m : null))
      .catch(() => null);
  }
  return fsPromise;
}

function fileNameForKey(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

/** JSON files under <documentDirectory>/drafts/. Falls back to memory (web / no FS). */
export function fileDraftBackend(): DraftBackend {
  const memory = memoryDraftBackend();
  let dirReady: Promise<void> | null = null;
  const dirOf = (fs: LegacyFs) => `${fs.documentDirectory}drafts/`;
  const ensureDir = (fs: LegacyFs) => {
    if (!dirReady) {
      dirReady = fs
        .makeDirectoryAsync(dirOf(fs), { intermediates: true })
        .catch(() => undefined);
    }
    return dirReady;
  };
  return {
    async read(key) {
      const fs = await loadFs();
      if (!fs) return memory.read(key);
      const uri = dirOf(fs) + fileNameForKey(key);
      const info = await fs.getInfoAsync(uri);
      if (!info.exists) return null;
      return fs.readAsStringAsync(uri);
    },
    async write(key, value) {
      const fs = await loadFs();
      if (!fs) return memory.write(key, value);
      await ensureDir(fs);
      await fs.writeAsStringAsync(dirOf(fs) + fileNameForKey(key), value);
    },
    async remove(key) {
      const fs = await loadFs();
      if (!fs) return memory.remove(key);
      await fs.deleteAsync(dirOf(fs) + fileNameForKey(key), { idempotent: true });
    },
  };
}

/** App-wide draft store. */
export const drafts = createDraftStore(fileDraftBackend());

/** True when a local media URI still exists (cache dirs can be purged). Remote URLs pass. */
export async function localFileExists(uri: string | null | undefined): Promise<boolean> {
  if (!uri) return false;
  if (/^https?:\/\//i.test(uri)) return true;
  const fs = await loadFs();
  if (!fs) return false;
  try {
    const info = await fs.getInfoAsync(uri);
    return !!info.exists;
  } catch {
    return false;
  }
}

/** Idempotency-Key for one compose session / draft (shared helper). */
export { newIdempotencyKey } from './api/idempotency';

// --- Draft shapes ---------------------------------------------------------------

export const JOURNAL_DRAFT_NS = 'journal-draft';
export const ON_THIS_DAY_NS = 'journal-on-this-day';

export type JournalDraft = {
  content: string;
  mood: string | null;
  path: string | null;
  isPublic: boolean;
  idempotencyKey: string;
};

export function composerDraftNs(kind: string): string {
  return `composer-draft-${kind}`;
}

/**
 * A draft that was handed to the background publish queue. It stays on disk
 * until the publish succeeds, so an app kill mid-upload can still offer
 * "Continue your draft?" (same idempotency key → no duplicate post).
 */
export function composerPendingNs(kind: string): string {
  return `composer-pending-${kind}`;
}

export type ComposerDraft = {
  kind: 'post' | 'reel' | 'story';
  caption: string;
  category: string | null;
  media: {
    uri: string;
    mediaType: 'image' | 'video';
    mimeType?: string;
    durationMs: number;
  } | null;
  /** Video edit metadata (trim / cover) — VideoEditSettings shape. */
  videoEdit: Record<string, unknown> | null;
  audio: { id: string; title: string; url: string } | null;
  idempotencyKey: string;
};

/** Drop media whose local file is gone; null when nothing worth restoring is left. */
export async function sanitizeComposerDraft(
  draft: ComposerDraft,
  exists: (uri: string) => Promise<boolean> = localFileExists
): Promise<{ draft: ComposerDraft; droppedMedia: boolean } | null> {
  let droppedMedia = false;
  let next = draft;
  if (draft.media && !(await exists(draft.media.uri))) {
    next = { ...draft, media: null, videoEdit: null };
    droppedMedia = true;
  }
  if (!next.media && !next.caption.trim() && !next.audio) return null;
  return { draft: next, droppedMedia };
}
