import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getForYouFeed, type FeedPost } from '../../services/api/feed';

export type FeedLoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export type FeedSection = 'following' | 'suggested';

export type FeedPostWithSection = FeedPost & {
  relevance_score?: number;
  feed_section?: FeedSection;
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

export const fetchFeedPosts = createAsyncThunk('feed/fetchPosts', async (_, { rejectWithValue }) => {
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
});

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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFeedPosts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchFeedPosts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.following = action.payload.following;
        state.suggested = action.payload.suggested;
        state.items = [...action.payload.following, ...action.payload.suggested];
        state.lastFetchedAt = new Date().toISOString();
      })
      .addCase(fetchFeedPosts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = typeof action.payload === 'string' ? action.payload : 'Failed to load feed';
      });
  },
});

export const { clearFeed } = feedSlice.actions;
export default feedSlice.reducer;
