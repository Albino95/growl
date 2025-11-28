import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Post {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  image: string;
  caption: string;
  category: string;
  subcategory?: string;
  likes: number;
  comments: number;
  timestamp: string;
  hasLiked: boolean;
}

interface PostState {
  posts: Post[];
  currentPost: {
    image: string | null;
    caption: string;
    selectedCategory: string | null;
  };
  isPosting: boolean;
}

const initialState: PostState = {
  posts: [],
  currentPost: {
    image: null,
    caption: '',
    selectedCategory: null,
  },
  isPosting: false,
};

const postSlice = createSlice({
  name: 'posts',
  initialState,
  reducers: {
    setCurrentImage: (state, action: PayloadAction<string | null>) => {
      state.currentPost.image = action.payload;
    },
    setCurrentCaption: (state, action: PayloadAction<string>) => {
      state.currentPost.caption = action.payload;
    },
    setSelectedCategory: (state, action: PayloadAction<string | null>) => {
      state.currentPost.selectedCategory = action.payload;
    },
    setPosting: (state, action: PayloadAction<boolean>) => {
      state.isPosting = action.payload;
    },
    addPost: (state, action: PayloadAction<Post>) => {
      state.posts.unshift(action.payload);
    },
    toggleLike: (state, action: PayloadAction<string>) => {
      const post = state.posts.find((p) => p.id === action.payload);
      if (post) {
        post.hasLiked = !post.hasLiked;
        post.likes += post.hasLiked ? 1 : -1;
      }
    },
    resetCurrentPost: (state) => {
      state.currentPost = {
        image: null,
        caption: '',
        selectedCategory: null,
      };
    },
    setPosts: (state, action: PayloadAction<Post[]>) => {
      state.posts = action.payload;
    },
  },
});

export const {
  setCurrentImage,
  setCurrentCaption,
  setSelectedCategory,
  setPosting,
  addPost,
  toggleLike,
  resetCurrentPost,
  setPosts,
} = postSlice.actions;

export default postSlice.reducer;

