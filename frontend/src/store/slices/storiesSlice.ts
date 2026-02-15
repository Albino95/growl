import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type Story = {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image?: string;
  createdAt?: string;
  views?: number;
  hasViewed: boolean;
};

interface StoriesState {
  stories: Story[];
  currentStoryIndex: number | null;
  isViewing: boolean;
}

const initialState: StoriesState = {
  stories: [],
  currentStoryIndex: null,
  isViewing: false,
};

const storiesSlice = createSlice({
  name: 'stories',
  initialState,
  reducers: {
    setStories: (state, action: PayloadAction<Story[]>) => {
      state.stories = action.payload;
    },
    addStory: (state, action: PayloadAction<Story>) => {
      state.stories.push(action.payload);
    },
    updateStory: (state, action: PayloadAction<{ id: string; updates: Partial<Story> }>) => {
      const story = state.stories.find((s) => s.id === action.payload.id);
      if (story) {
        Object.assign(story, action.payload.updates);
      }
    },
    markStoryAsViewed: (state, action: PayloadAction<string>) => {
      const story = state.stories.find((s) => s.id === action.payload);
      if (story) {
        story.hasViewed = true;
      }
    },
    markUserStoriesAsViewed: (state, action: PayloadAction<string>) => {
      state.stories.forEach((story) => {
        if (story.userId === action.payload) {
          story.hasViewed = true;
        }
      });
    },
    setCurrentStoryIndex: (state, action: PayloadAction<number | null>) => {
      state.currentStoryIndex = action.payload;
      state.isViewing = action.payload !== null;
    },
    removeStory: (state, action: PayloadAction<string>) => {
      state.stories = state.stories.filter((s) => s.id !== action.payload);
    },
    clearStories: (state) => {
      state.stories = [];
      state.currentStoryIndex = null;
      state.isViewing = false;
    },
  },
});

export const {
  setStories,
  addStory,
  updateStory,
  markStoryAsViewed,
  markUserStoriesAsViewed,
  setCurrentStoryIndex,
  removeStory,
  clearStories,
} = storiesSlice.actions;

export default storiesSlice.reducer;
