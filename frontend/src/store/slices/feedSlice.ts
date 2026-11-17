import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getFeedPage, FEED_PAGE_SIZE, type FeedPost } from '../../services/api/feed';
import {
  appendFeedPage,
  isStale,
  mergeRefreshedFirstPage,
  prependToFollowing,
} from '../../utils/feedPaging';
import type { RootState } from '../store';

export type FeedLoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type FeedSection = 'following' | 'suggested';

export type FeedPostWithSection = FeedPost & {
  relevance_score?: number;
  feed_section?: FeedSection;
};

export type FetchFeedArgs = {
  /** Bypass stale-while-revalidate skip (pull-to-refresh, polling). */
  force?: boolean;
  /** Do not flip status to loading (background refresh while posts visible). */
  silent?: boolean;
};

interface FeedState {
  following: FeedPostWithSection[];
  suggested: FeedPostWithSection[];
  items: FeedPostWithSection[];
  status: FeedLoadStatus;
  error: string | null;
  lastFetchedAt: string | null;
  /** Token for the next page; null = all caught up (or server without paging). */
  nextCursor: string | null;
  /** Pages appended since the last full reset (1 after the first load). */
  pagesLoaded: number;
  loadingMore: boolean;
  loadMoreError: string | null;
  /** Bumped on every full reset so in-flight "load more" responses are dropped. */
  pageGen: number;
}

const initialState: FeedState = {
  following: [],
  suggested: [],
  items: [],
  status: 'idle',
  error: null,
  lastFetchedAt: null,
  nextCursor: null,
  pagesLoaded: 0,
  loadingMore: false,
  loadMoreError: null,
  pageGen: 0,
};

/** Skip redundant fetches when data is still fresh (unless force). */
export const FEED_STALE_MS = 60_000;

export const fetchFeedPosts = createAsyncThunk(
  'feed/fetchPosts',
  async (_args: FetchFeedArgs | undefined, { rejectWithValue }) => {
    try {
      const page = await getFeedPage({ mode: 'foryou', limit: FEED_PAGE_SIZE });
      return { following: page.following, suggested: page.suggested, nextCursor: page.nextCursor };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load feed';
      return rejectWithValue(message);
    }
  },
  {
    condition: (args, { getState }) => {
      if (args?.force) return true;
      const state = getState() as RootState;
      if (state.feed.status === 'loading') return false;
      if (state.feed.items.length > 0 && !isStale(state.feed.lastFetchedAt, FEED_STALE_MS)) {
        return false;
      }
      return true;
    },
  }
);

/** Next page (infinite scroll). Abort the returned promise to cancel. */
export const fetchMoreFeedPosts = createAsyncThunk(
  'feed/fetchMore',
  async (_arg: void, { getState, signal, rejectWithValue }) => {
    const state = getState() as RootState;
    const gen = state.feed.pageGen;
    const cursor = state.feed.nextCursor;
    try {
      const page = await getFeedPage({ mode: 'foryou', cursor, limit: FEED_PAGE_SIZE, signal });
      return { gen, cursor, page };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not load more posts';
      return rejectWithValue({ gen, message });
    }
  },
  {
    condition: (_arg, { getState }) => {
      const s = (getState() as RootState).feed;
      return !!s.nextCursor && !s.loadingMore && s.status !== 'loading';
    },
  }
);

function syncItems(state: FeedState) {
  state.items = [...state.following, ...state.suggested];
}

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    clearFeed: (state) => {
      Object.assign(state, { ...initialState, pageGen: state.pageGen + 1 });
    },
    /** Optimistic insert after create so the author sees the post immediately. */
    prependFeedPost: (state, action: PayloadAction<FeedPostWithSection>) => {
      const post = { ...action.payload, feed_section: 'following' as const };
      const next = prependToFollowing(state, post);
      state.following = next.following;
      state.suggested = next.suggested;
      syncItems(state);
    },
    /** Author deleted a post: drop it from every feed section. */
    removeFeedPost: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.following = state.following.filter((p) => p.id !== id);
      state.suggested = state.suggested.filter((p) => p.id !== id);
      syncItems(state);
    },
    /** Keep like/comment counts and has_liked in sync with optimistic UI (SectionList reads Redux). */
    patchFeedPostEngagement: (
      state,
      action: PayloadAction<{
        id: string;
        likes?: number;
        comments?: number;
        has_liked?: boolean;
      }>
    ) => {
      const { id, likes, comments, has_liked } = action.payload;
      const apply = (p: FeedPostWithSection): FeedPostWithSection => {
        if (p.id !== id) return p;
        return {
          ...p,
          metadata: {
            ...p.metadata,
            ...(likes !== undefined ? { likes } : {}),
            ...(comments !== undefined ? { comments } : {}),
            ...(has_liked !== undefined ? { has_liked } : {}),
          },
        };
      };
      state.following = state.following.map(apply);
      state.suggested = state.suggested.map(apply);
      state.items = state.items.map(apply);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedPosts.pending, (state, action) => {
        if (!action.meta.arg?.silent) {
          state.status = 'loading';
        }
        // Pull-to-refresh / retry: anything still paging belongs to the old list.
        if (action.meta.arg?.force && !action.meta.arg?.silent) {
          state.pageGen += 1;
          state.loadingMore = false;
          state.loadMoreError = null;
        }
        state.error = null;
      })
      .addCase(fetchFeedPosts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const hasVisibleFeed = state.following.length > 0 || state.suggested.length > 0;
        // Pull-to-refresh / retry use force without silent → full replace (back to page 1).
        // Silent polls and stale refocuses merge so likes/comments don't eject posts.
        const hardRefresh = !!action.meta.arg?.force && !action.meta.arg?.silent;
        const shouldReplace = !hasVisibleFeed || hardRefresh;

        if (shouldReplace) {
          state.following = action.payload.following;
          state.suggested = action.payload.suggested;
          state.nextCursor = action.payload.nextCursor;
          state.pagesLoaded = 1;
          state.loadMoreError = null;
          if (!hardRefresh) state.pageGen += 1;
        } else {
          const merged = mergeRefreshedFirstPage(state, action.payload);
          state.following = merged.following;
          state.suggested = merged.suggested;
          // Deeper pages keep their own cursor; only a lone page 1 adopts the new one.
          if (state.pagesLoaded <= 1) state.nextCursor = action.payload.nextCursor;
        }

        syncItems(state);
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(fetchFeedPosts.rejected, (state, action) => {
        if (action.meta.aborted || action.meta.condition) return;
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Failed to load feed';
      })
      .addCase(fetchMoreFeedPosts.pending, (state) => {
        state.loadingMore = true;
        state.loadMoreError = null;
      })
      .addCase(fetchMoreFeedPosts.fulfilled, (state, action) => {
        const { gen, cursor, page } = action.payload;
        // Stale response (list was reset, or another page already advanced the cursor).
        if (gen !== state.pageGen) return;
        state.loadingMore = false;
        if (cursor !== state.nextCursor) return;
        const next = appendFeedPage(state, page);
        state.following = next.following;
        state.suggested = next.suggested;
        state.nextCursor = page.nextCursor;
        state.pagesLoaded += 1;
        syncItems(state);
      })
      .addCase(fetchMoreFeedPosts.rejected, (state, action) => {
        if (action.meta.condition) return;
        const payload = action.payload as { gen: number; message: string } | undefined;
        if (payload && payload.gen !== state.pageGen) return;
        state.loadingMore = false;
        if (action.meta.aborted) return;
        state.loadMoreError = payload?.message || 'Could not load more posts';
      });
  },
});

export const { clearFeed, prependFeedPost, patchFeedPostEngagement, removeFeedPost } =
  feedSlice.actions;
export default feedSlice.reducer;
