/**
 * GET /search (FTS, wave 3). Falls back to the older GET /social/search when the backend
 * doesn't have the new endpoint yet (404), mapping its results into the same shape.
 */
import { ApiError, request } from './http';
import { searchSocial } from './friends';

export type SearchType = 'all' | 'people' | 'posts' | 'tags';

export type SearchPerson = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  paths: string[];
  is_friend: boolean;
};

export type SearchAuthor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type SearchPost = {
  id: string;
  thumb_url: string | null;
  caption_snippet: string;
  category?: string;
  created_at?: string;
  author: SearchAuthor;
};

export type SearchTag = { tag: string; count: number };

export type SearchResult = {
  people: SearchPerson[];
  posts: SearchPost[];
  tags: SearchTag[];
  more: { people: boolean; posts: boolean; tags: boolean };
  next_cursor: string | null;
  /** True when served by the old endpoint (no tags, no paging). */
  legacy: boolean;
};

export type SearchOpts = {
  type?: SearchType;
  limit?: number;
  cursor?: string | null;
  signal?: AbortSignal;
};

const EMPTY: SearchResult = {
  people: [],
  posts: [],
  tags: [],
  more: { people: false, posts: false, tags: false },
  next_cursor: null,
  legacy: false,
};

/** Remembered for the session once the new endpoint 404s, so we don't ask twice per keystroke. */
let newEndpointMissing = false;

/** Test hook. */
export function resetSearchEndpointProbe(): void {
  newEndpointMissing = false;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const LEGACY_ALL_LIMITS = { people: 5, posts: 6 };

async function legacySearch(q: string, opts: SearchOpts): Promise<SearchResult> {
  const type = opts.type ?? 'all';
  // The old endpoint has no tags; for '#tag' it searches the caption text instead.
  if (type === 'tags') return { ...EMPTY, legacy: true };
  const text = q.replace(/^#/, '');
  const res = await searchSocial(text, {
    limit: opts.limit ?? 24,
    type: type === 'people' ? 'accounts' : type === 'posts' ? 'posts' : 'all',
  });
  let people: SearchPerson[] = res.people.map((p) => ({
    id: p.id,
    username: p.username,
    display_name: p.username,
    avatar_url: p.avatar ?? null,
    paths: p.categories ?? [],
    is_friend: !!p.isFriend,
  }));
  let posts: SearchPost[] = res.posts.map((p) => ({
    id: p.id,
    thumb_url: p.image_url ?? null,
    caption_snippet: (p.caption ?? '').slice(0, 140),
    category: p.category,
    created_at: p.created_at,
    author: { id: p.user_id, username: p.username, display_name: p.username, avatar_url: p.avatar ?? null },
  }));
  if (q.startsWith('#')) people = [];
  const more = { people: false, posts: false, tags: false };
  if (type === 'all') {
    more.people = people.length > LEGACY_ALL_LIMITS.people;
    more.posts = posts.length > LEGACY_ALL_LIMITS.posts;
    people = people.slice(0, LEGACY_ALL_LIMITS.people);
    posts = posts.slice(0, LEGACY_ALL_LIMITS.posts);
  }
  return { people, posts, tags: [], more, next_cursor: null, legacy: true };
}

/** Throws ApiError / AbortError like other API calls; callers ignore aborts. */
export async function searchAll(query: string, opts: SearchOpts = {}): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return EMPTY;
  if (newEndpointMissing) return legacySearch(q, opts);
  const params = new URLSearchParams({ q, type: opts.type ?? 'all' });
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  try {
    const res = await request<{ success: boolean; data: Partial<SearchResult> }>(
      `/search?${params.toString()}`,
      { signal: opts.signal }
    );
    const d = res.data ?? {};
    return {
      people: arr<SearchPerson>(d.people),
      posts: arr<SearchPost>(d.posts),
      tags: arr<SearchTag>(d.tags),
      more: {
        people: !!d.more?.people,
        posts: !!d.more?.posts,
        tags: !!d.more?.tags,
      },
      next_cursor: typeof d.next_cursor === 'string' ? d.next_cursor : null,
      legacy: false,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      newEndpointMissing = true;
      return legacySearch(q, opts);
    }
    throw e;
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    !!e &&
    typeof e === 'object' &&
    ((e as { name?: string }).name === 'AbortError' || /aborted/i.test(String((e as Error).message ?? '')))
  );
}
