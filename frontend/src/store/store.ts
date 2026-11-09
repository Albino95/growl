import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
// Import slices
import authSlice from './slices/authSlice';
import postSlice from './slices/postSlice';
import marketplaceSlice from './slices/marketplaceSlice';
import feedSlice from './slices/feedSlice';
import journalSlice from './slices/journalSlice';
import businessSlice from './slices/businessSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    posts: postSlice,
    marketplace: marketplaceSlice,
    feed: feedSlice,
    journal: journalSlice,
    business: businessSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks for better TypeScript support
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

