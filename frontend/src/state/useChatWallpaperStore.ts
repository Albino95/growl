import { create } from 'zustand';
import { getSecureItem, setSecureItem } from '../services/storage/secureStore';

const STORAGE_KEY = 'grow.chatWalls.v1';

export type ChatWallId = 'linen' | 'sage' | 'mist' | 'coral' | 'dusk' | 'ink';

export type ChatWallTheme = {
  id: ChatWallId;
  label: string;
  page: string;
  peerBubble: string;
  peerBorder: string;
  peerText: string;
  ownBubble: string;
  ownText: string;
  meta: string;
  composer: string;
  header: string;
  swatch: string;
};

export const CHAT_WALLS: ChatWallTheme[] = [
  {
    id: 'linen',
    label: 'Linen',
    page: '#F3EEE4',
    peerBubble: '#FFFcf7',
    peerBorder: 'rgba(28,25,23,0.08)',
    peerText: '#1C1917',
    ownBubble: '#059669',
    ownText: '#FFFFFF',
    meta: '#6B645E',
    composer: '#FFFcf7',
    header: '#F3EEE4',
    swatch: '#F3EEE4',
  },
  {
    id: 'sage',
    label: 'Sage',
    page: '#D8E6D8',
    peerBubble: '#F4FBF4',
    peerBorder: 'rgba(6,95,70,0.12)',
    peerText: '#14532D',
    ownBubble: '#047857',
    ownText: '#FFFFFF',
    meta: '#3F6212',
    composer: '#F4FBF4',
    header: '#D8E6D8',
    swatch: '#A7C4A0',
  },
  {
    id: 'mist',
    label: 'Mist',
    page: '#E4E9EF',
    peerBubble: '#F7F9FC',
    peerBorder: 'rgba(28,25,23,0.08)',
    peerText: '#1C1917',
    ownBubble: '#334155',
    ownText: '#FFFFFF',
    meta: '#64748B',
    composer: '#F7F9FC',
    header: '#E4E9EF',
    swatch: '#94A3B8',
  },
  {
    id: 'coral',
    label: 'Coral',
    page: '#FFF1F0',
    peerBubble: '#FFF8F6',
    peerBorder: 'rgba(225,29,72,0.12)',
    peerText: '#1C1917',
    ownBubble: '#E11D48',
    ownText: '#FFFFFF',
    meta: '#9F1239',
    composer: '#FFF8F6',
    header: '#FFF1F0',
    swatch: '#F97066',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    page: '#2A2724',
    peerBubble: '#3A3632',
    peerBorder: 'rgba(255,252,247,0.08)',
    peerText: '#FFFcf7',
    ownBubble: '#059669',
    ownText: '#FFFFFF',
    meta: '#A8A29E',
    composer: '#3A3632',
    header: '#2A2724',
    swatch: '#44403C',
  },
  {
    id: 'ink',
    label: 'Ink',
    page: '#111827',
    peerBubble: '#1F2937',
    peerBorder: 'rgba(255,255,255,0.06)',
    peerText: '#F8FAFC',
    ownBubble: '#059669',
    ownText: '#FFFFFF',
    meta: '#94A3B8',
    composer: '#1F2937',
    header: '#111827',
    swatch: '#0F172A',
  },
];

export function wallTheme(id?: ChatWallId | null): ChatWallTheme {
  return CHAT_WALLS.find((w) => w.id === id) || CHAT_WALLS[0];
}

type State = {
  byId: Record<string, ChatWallId>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setWall: (conversationId: string, wall: ChatWallId) => void;
};

export const useChatWallpaperStore = create<State>((set, get) => ({
  byId: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getSecureItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, ChatWallId>) : {};
      set({ byId: parsed && typeof parsed === 'object' ? parsed : {}, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setWall: (conversationId, wall) => {
    const byId = { ...get().byId, [conversationId]: wall };
    set({ byId });
    void setSecureItem(STORAGE_KEY, JSON.stringify(byId));
  },
}));
