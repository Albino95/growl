import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
// Import slices
import authSlice from './slices/authSlice';
import postSlice from './slices/postSlice';
import photoEditorSlice from './slices/photoEditorSlice';
import storiesSlice from './slices/storiesSlice';
import marketplaceSlice from './slices/marketplaceSlice';
import feedSlice from './slices/feedSlice';
import journalSlice from './slices/journalSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    posts: postSlice,
    photoEditor: photoEditorSlice,
    stories: storiesSlice,
    marketplace: marketplaceSlice,
    feed: feedSlice,
    journal: journalSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for non-serializable values (like image URIs)
        ignoredActions: ['photoEditor/setEditedImage'],
        ignoredPaths: ['photoEditor.editedImage'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks for better TypeScript support
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

