import { create } from 'zustand';

/**
 * Cross-screen post events that don't live in Redux (Profile keeps its own post
 * list): when you delete a post anywhere, every list drops it without a refetch.
 */
type PostEventsState = {
  /** Ids deleted this session (newest last, capped). */
  deletedIds: string[];
  markDeleted: (id: string) => void;
  unmarkDeleted: (id: string) => void;
};

const MAX_TRACKED = 200;

export const usePostEventsStore = create<PostEventsState>((set) => ({
  deletedIds: [],
  markDeleted: (id) =>
    set((s) =>
      s.deletedIds.includes(id) ? s : { deletedIds: [...s.deletedIds, id].slice(-MAX_TRACKED) }
    ),
  unmarkDeleted: (id) => set((s) => ({ deletedIds: s.deletedIds.filter((x) => x !== id) })),
}));
