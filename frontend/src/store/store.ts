import { combineReducers, configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
// Import slices
import authSlice, { signOut } from './slices/authSlice';
import postSlice from './slices/postSlice';
import marketplaceSlice from './slices/marketplaceSlice';
import feedSlice from './slices/feedSlice';
import journalSlice from './slices/journalSlice';
import businessSlice from './slices/businessSlice';

const appReducer = combineReducers({
  auth: authSlice,
  posts: postSlice,
  marketplace: marketplaceSlice,
  feed: feedSlice,
  journal: journalSlice,
  business: businessSlice,
});

type AppState = ReturnType<typeof appReducer>;

const isSignOutSettled = (action: UnknownAction) =>
  signOut.fulfilled.match(action) || signOut.rejected.match(action);

/**
 * On sign-out every slice except `auth` (which handles signOut itself and must
 * keep `hydrated`) returns to its initial state, so nothing from the previous
 * account — business customers, journal entries, drafts, cart — survives into
 * the next session on this device.
 */
const rootReducer = (state: AppState | undefined, action: UnknownAction): AppState => {
  if (state && isSignOutSettled(action)) {
    return appReducer({ auth: state.auth } as AppState, action);
  }
  return appReducer(state, action);
};

/**
 * Requests started before a sign-out must not write the old account's data
 * back into the fresh store when they finish late. Each async thunk is tagged
 * with the session epoch at dispatch time; settled actions from an older epoch
 * are dropped. (auth/* is exempt: it owns the session lifecycle.)
 */
const sessionEpochGuard: Middleware = () => {
  let epoch = 0;
  const startedIn = new Map<string, number>();
  return (next) => (action) => {
    const a = action as UnknownAction & { meta?: { requestId?: string; requestStatus?: string } };
    const requestId = a.meta?.requestId;
    const status = a.meta?.requestStatus;
    const isAuth = typeof a.type === 'string' && a.type.startsWith('auth/');

    if (requestId && !isAuth) {
      if (status === 'pending') {
        startedIn.set(requestId, epoch);
      } else if (status === 'fulfilled' || status === 'rejected') {
        const started = startedIn.get(requestId);
        startedIn.delete(requestId);
        if (started !== undefined && started !== epoch) return action; // stale: drop
      }
    }

    if (isSignOutSettled(a)) epoch += 1;
    return next(action);
  };
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefault) => getDefault().concat(sessionEpochGuard),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks for better TypeScript support
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
