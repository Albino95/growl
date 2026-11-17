import { describe, it, expect, vi } from 'vitest';

// Keep the store test off native modules: auth/storage APIs become no-ops.
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null, requireNativeModule: () => ({}) }));
vi.mock('expo', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const { store } = await import('../store');
const { signOut } = await import('../slices/authSlice');

describe('sign-out clears the previous account from the store', () => {
  it('resets every slice except auth, and drops late responses from before sign-out', async () => {
    // A request that starts while user A is signed in...
    store.dispatch({ type: 'journal/fetchEntries/pending', meta: { requestId: 'r-old', requestStatus: 'pending' } });
    // ...user A's data is in the store.
    store.dispatch({ type: 'marketplace/setSelectedCategory', payload: 'fitness' });
    expect(store.getState().marketplace.selectedCategory).toBe('fitness');

    store.dispatch({ type: signOut.fulfilled.type, payload: { success: true }, meta: { requestId: 's1', requestStatus: 'fulfilled' } });
    expect(store.getState().marketplace.selectedCategory).toBeNull();

    // The old request finishes after sign-out: it must not write A's data back.
    const before = store.getState().journal;
    store.dispatch({
      type: 'journal/fetchEntries/fulfilled',
      payload: [{ id: 'private-entry' }],
      meta: { requestId: 'r-old', requestStatus: 'fulfilled' },
    });
    expect(store.getState().journal).toBe(before);
  });

  it('keeps auth hydrated so the app shows sign-in instead of the splash', () => {
    expect(store.getState().auth.token).toBeNull();
    expect(store.getState().auth).toHaveProperty('hydrated');
  });
});
