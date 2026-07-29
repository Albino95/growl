import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { getForYouFeed, type FeedPost } from '../../services/api/feed';
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
}

const initialState: FeedState = {
  following: [],
  suggested: [],
  items: [],
  status: 'idle',
  error: null,
  lastFetchedAt: null,
};

/** Skip redundant fetches when data is still fresh (unless force). */
const FEED_STALE_MS = 40_000;

export const fetchFeedPosts = createAsyncThunk(
  'feed/fetchPosts',
  async (_args: FetchFeedArgs | undefined, { rejectWithValue }) => {
    try {
      const res = await getForYouFeed();
      if (!res.success || !res.data) {
        return rejectWithValue('Unexpected feed response');
      }
      const following = Array.isArray(res.data.following) ? res.data.following : [];
      const suggested = Array.isArray(res.data.suggested) ? res.data.suggested : [];
      return { following, suggested };
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
      const last = state.feed.lastFetchedAt;
      if (last && state.feed.items.length > 0) {
        const age = Date.now() - new Date(last).getTime();
        if (age < FEED_STALE_MS) return false;
      }
      return true;
    },
  }
);

/**
 * Background poll merge: refresh engagement on posts already on screen, prepend
 * new ones, and never drop a card the user is still looking at (server top-N
 * window churns when likes/comments bump engagement_score).
 */
function mergeFeedSection(
  existing: FeedPostWithSection[],
  incoming: FeedPostWithSection[],
  movedToOtherSection: Set<string>
): FeedPostWithSection[] {
  const incomingById = new Map(incoming.map((p) => [p.id, p]));
  const kept = existing
    .filter((p) => !movedToOtherSection.has(p.id))
    .map((p) => incomingById.get(p.id) ?? p);
  const keptIds = new Set(kept.map((p) => p.id));
  // Append (don't prepend) so the post the user is looking at doesn't jump away.
  const brandNew = incoming.filter((p) => !keptIds.has(p.id));
  return [...kept, ...brandNew];
}

const feedSlice = createSlice({
  name: 'feed',
  initialState,
  reducers: {
    clearFeed: (state) => {
      state.following = [];
      state.suggested = [];
      state.items = [];
      state.status = 'idle';
      state.error = null;
      state.lastFetchedAt = null;
    },
    /** Optimistic insert after create so the author sees the post immediately. */
    prependFeedPost: (state, action: PayloadAction<FeedPostWithSection>) => {
      const post = { ...action.payload, feed_section: 'following' as const };
      state.following = [post, ...state.following.filter((p) => p.id !== post.id)];
      state.items = [post, ...state.items.filter((p) => p.id !== post.id)];
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
        state.error = null;
      })
      .addCase(fetchFeedPosts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const hasVisibleFeed = state.following.length > 0 || state.suggested.length > 0;
        // Pull-to-refresh / retry use force without silent → full replace.
        // Silent polls and stale refocuses merge so likes/comments don't eject posts.
        const hardRefresh = !!action.meta.arg?.force && !action.meta.arg?.silent;
        const shouldReplace = !hasVisibleFeed || hardRefresh;

        if (!shouldReplace) {
          const incomingSuggestedIds = new Set(action.payload.suggested.map((p) => p.id));
          const incomingFollowingIds = new Set(action.payload.following.map((p) => p.id));
          state.following = mergeFeedSection(
            state.following,
            action.payload.following,
            incomingSuggestedIds
          );
          state.suggested = mergeFeedSection(
            state.suggested,
            action.payload.suggested,
            incomingFollowingIds
          );
          const followingIds = new Set(state.following.map((p) => p.id));
          state.suggested = state.suggested.filter((p) => !followingIds.has(p.id));
        } else {
          state.following = action.payload.following;
          state.suggested = action.payload.suggested;
        }

        state.items = [...state.following, ...state.suggested];
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(fetchFeedPosts.rejected, (state, action) => {
        if (action.meta.aborted || action.meta.condition) return;
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Failed to load feed';
      });
  },
});

export const { clearFeed, prependFeedPost, patchFeedPostEngagement } = feedSlice.actions;
export default feedSlice.reducer;
