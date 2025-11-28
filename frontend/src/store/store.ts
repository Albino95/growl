import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
// Import slices
import postSlice from './slices/postSlice';
import photoEditorSlice from './slices/photoEditorSlice';

export const store = configureStore({
  reducer: {
    posts: postSlice,
    photoEditor: photoEditorSlice,
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

