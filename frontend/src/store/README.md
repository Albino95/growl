# Redux Store Setup

This directory contains the Redux store configuration for the app.

## Structure

```
src/store/
├── store.ts              # Main store configuration
├── slices/               # Redux slices (feature-based)
│   ├── authSlice.ts        # Session, tokens, current user
│   ├── feedSlice.ts        # Home / explore feed
│   ├── postSlice.ts        # Post creation state
│   ├── journalSlice.ts     # Journal entries
│   ├── marketplaceSlice.ts # Products and cart
│   └── businessSlice.ts    # Business dashboard data
└── README.md
```

Small, device-local UI preferences (chat wallpaper, home tab, tutorial and
activation flags) live in Zustand stores under `src/state/`. Server data and
auth belong in Redux.

## Usage

### Accessing Redux State

```typescript
import { useAppSelector } from '../store/store';

// In a component
const posts = useAppSelector((state) => state.posts.posts);
const currentImage = useAppSelector((state) => state.posts.currentPost.image);
```

### Dispatching Actions

```typescript
import { useAppDispatch } from '../store/store';
import { setCurrentImage, addPost } from '../store/slices/postSlice';

// In a component
const dispatch = useAppDispatch();

dispatch(setCurrentImage(imageUri));
dispatch(addPost(newPost));
```

## Slices

### postSlice
Manages post-related state:
- List of posts
- Current post being created (image, caption, category)
- Posting status

## Adding a New Slice

1. Create a new file in `slices/` directory
2. Use `createSlice` from Redux Toolkit
3. Export the reducer and actions
4. Add the reducer to `store.ts`

Example:
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

const mySlice = createSlice({
  name: 'myFeature',
  initialState: { /* ... */ },
  reducers: {
    // actions here
  },
});

export const { action1, action2 } = mySlice.actions;
export default mySlice.reducer;
```

## Migration from useState/useReducer

For component-level state management:
- Use `useReducer` for complex component state (like PhotoEditor)
- Use Redux for shared/global state across components
- Use `useState` for simple, isolated component state

