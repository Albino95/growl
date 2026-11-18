import { create } from 'zustand';
import { ApiError } from '../../services/api/http';
import { getSavedProducts, saveProduct, unsaveProduct } from '../../services/api/bizInsights';
import { toast } from '../../state/useToastStore';

/**
 * Shared "saved products" (heart) state so the marketplace grid, product detail and the
 * Saved list agree. Toggles are optimistic and roll back on failure. `available` turns
 * false when the server has no saves yet (404) so hearts hide instead of erroring.
 */
type SavedState = {
  ids: Record<string, true>;
  loaded: boolean;
  loading: boolean;
  available: boolean;
  pending: Record<string, true>;
  /** Account the ids belong to; a different account resets the cache. */
  owner: string | null;
  load: (userId: string | null | undefined, force?: boolean) => Promise<void>;
  toggle: (productId: string) => Promise<boolean | null>;
  reset: () => void;
};

export const useSavedProducts = create<SavedState>((set, get) => ({
  ids: {},
  loaded: false,
  loading: false,
  available: true,
  pending: {},
  owner: null,

  load: async (userId, force = false) => {
    if (!userId) return;
    if (get().owner !== userId) {
      set({ ids: {}, loaded: false, loading: false, available: true, pending: {}, owner: userId });
    }
    const s = get();
    if (s.loading || (s.loaded && !force)) return;
    set({ loading: true });
    try {
      const products = await getSavedProducts();
      if (get().owner !== userId) return;
      if (products === null) {
        set({ available: false, loaded: true, loading: false });
        return;
      }
      const ids: Record<string, true> = {};
      for (const p of products) ids[p.id] = true;
      set({ ids, loaded: true, loading: false, available: true });
    } catch {
      // Signed out / offline: hearts still work optimistically; try again next time.
      set({ loading: false });
    }
  },

  toggle: async (productId) => {
    const s = get();
    if (s.pending[productId]) return null;
    const wasSaved = !!s.ids[productId];
    const next = { ...s.ids };
    if (wasSaved) delete next[productId];
    else next[productId] = true;
    set({ ids: next, pending: { ...s.pending, [productId]: true } });
    const done = () => {
      const p = { ...get().pending };
      delete p[productId];
      return p;
    };
    try {
      const res = wasSaved ? await unsaveProduct(productId) : await saveProduct(productId);
      const ids = { ...get().ids };
      if (res.saved) ids[productId] = true;
      else delete ids[productId];
      set({ ids, pending: done() });
      return res.saved;
    } catch (e) {
      const ids = { ...get().ids };
      if (wasSaved) ids[productId] = true;
      else delete ids[productId];
      const notAvailable = e instanceof ApiError && e.status === 404 && e.code !== 'PRODUCT_NOT_FOUND';
      set({ ids, pending: done(), ...(notAvailable ? { available: false } : {}) });
      if (e instanceof ApiError && e.code === 'PRODUCT_NOT_FOUND') {
        toast.info('This product is no longer available.');
      } else if (!notAvailable) {
        toast.info(wasSaved ? 'Couldn’t remove it. Try again.' : 'Couldn’t save it. Try again.');
      }
      return wasSaved;
    }
  },

  reset: () => set({ ids: {}, loaded: false, loading: false, available: true, pending: {}, owner: null }),
}));
