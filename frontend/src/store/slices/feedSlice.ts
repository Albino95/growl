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
    const res = await getFeedPosts();
    if (!res.success || !Array.isArray(res.data)) {
      return rejectWithValue('Unexpected feed response');
    }
    return res.data;
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
