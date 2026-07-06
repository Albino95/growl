import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getFeedPosts, type FeedPost } from '../../services/api/feed';

export type FeedLoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface FeedState {
  items: FeedPost[];
  status: FeedLoadStatus;
  error: string | null;
  lastFetchedAt: string | null;
}

const initialState: FeedState = {
  items: [],
  status: 'idle',
  error: null,
  lastFetchedAt: null,
};

export const fetchFeedPosts = createAsyncThunk('feed/fetchPosts', async (_, { rejectWithValue }) => {
  try {
    const [homeRes, exploreRes] = await Promise.all([
      getFeedPosts(),
      getFeedPosts({ mode: 'explore' }),
    ]);

    if (!homeRes.success) {
      return rejectWithValue('Unexpected feed response');
    }

    const home = Array.isArray(homeRes.data) ? homeRes.data : [];
    const explore =
      exploreRes.success && Array.isArray(exploreRes.data) ? exploreRes.data : [];

    const byId = new Map<string, FeedPost>();
    for (const post of home) byId.set(post.id, post);
    for (const post of explore) {
      if (!byId.has(post.id)) byId.set(post.id, post);
    }

    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
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
        state.items = action.payload;
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
