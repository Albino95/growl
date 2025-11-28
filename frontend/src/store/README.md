# Redux Store Setup

This directory contains the Redux store configuration for the app.

## Structure

```
src/store/
├── store.ts              # Main store configuration
├── slices/               # Redux slices (feature-based)
│   ├── postSlice.ts     # Post-related state
│   └── photoEditorSlice.ts # Photo editor state
└── README.md
```

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

### photoEditorSlice
Manages photo editor state:
- Edited image URI
- Current filter
- Adjustments (brightness, contrast, saturation)
- Transformations (rotation, flips)
- Processing status

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

