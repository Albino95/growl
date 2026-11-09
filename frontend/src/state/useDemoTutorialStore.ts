import { create } from 'zustand';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.demoTutorial.v2';

type DemoTutorialState = {
  hydrated: boolean;
  seen: boolean;
  forceShow: boolean;
  hydrate: () => Promise<void>;
  complete: () => Promise<void>;
  replay: () => void;
};

export const useDemoTutorialStore = create<DemoTutorialState>((set, get) => ({
  hydrated: false,
  seen: false,
  forceShow: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const raw = await getSecureItem(STORAGE_KEY);
    set({ hydrated: true, seen: raw === '1' });
  },
  complete: async () => {
    await setSecureItem(STORAGE_KEY, '1');
    set({ seen: true, forceShow: false });
  },
  replay: () => set({ forceShow: true }),
}));

export async function resetDemoTutorialFlag(): Promise<void> {
  await deleteSecureItem(STORAGE_KEY);
  useDemoTutorialStore.setState({ seen: false, forceShow: true, hydrated: true });
}
