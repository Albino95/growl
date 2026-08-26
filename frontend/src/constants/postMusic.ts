export type PostMusicTrack = {
  id: string;
  title: string;
  artist: string;
  /** Royalty-free / CC demo preview URLs for soundtracks */
  url: string;
  /** Short mood tag shown in pickers */
  mood?: string;
  /** Genre chip for library filters */
  genre?: string;
};

/**
 * Shared public music library for posts + reels (Instagram-style picker).
 *
 * Sources: SoundHelix demos + Free Music Archive (CC).
 * We cannot ship licensed chart hits — titles mirror popular *moods/styles*.
 */
export const POST_MUSIC_TRACKS: PostMusicTrack[] = [
  // —— Popular-style moods (SoundHelix demos) ——
  {
    id: 'chart-energy',
    title: 'Chart Energy',
    artist: 'Grow Sounds',
    mood: 'Upbeat',
    genre: 'Pop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'summer-anthem',
    title: 'Summer Anthem',
    artist: 'Grow Sounds',
    mood: 'Feel-good',
    genre: 'Pop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'night-drive',
    title: 'Night Drive',
    artist: 'Grow Sounds',
    mood: 'Drive',
    genre: 'Electronic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'club-pulse',
    title: 'Club Pulse',
    artist: 'Grow Sounds',
    mood: 'Dance',
    genre: 'Dance',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'trap-flex',
    title: 'Trap Flex',
    artist: 'Grow Sounds',
    mood: 'Hype',
    genre: 'Hip-Hop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    id: 'lofi-study',
    title: 'Lo-fi Study',
    artist: 'Grow Sounds',
    mood: 'Chill',
    genre: 'Lo-fi',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    id: 'indie-glow',
    title: 'Indie Glow',
    artist: 'Grow Sounds',
    mood: 'Bright',
    genre: 'Indie',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    id: 'deep-focus',
    title: 'Deep Focus',
    artist: 'Grow Sounds',
    mood: 'Focus',
    genre: 'Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  {
    id: 'workout-fire',
    title: 'Workout Fire',
    artist: 'Grow Sounds',
    mood: 'Hype',
    genre: 'Electronic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },
  {
    id: 'soft-morning',
    title: 'Soft Morning',
    artist: 'Grow Sounds',
    mood: 'Chill',
    genre: 'Acoustic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  },
  {
    id: 'city-lights',
    title: 'City Lights',
    artist: 'Grow Sounds',
    mood: 'Groove',
    genre: 'Electronic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  },
  {
    id: 'viral-hook',
    title: 'Viral Hook',
    artist: 'Grow Sounds',
    mood: 'Upbeat',
    genre: 'Pop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  },
  {
    id: 'late-night',
    title: 'Late Night',
    artist: 'Grow Sounds',
    mood: 'Night',
    genre: 'R&B',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  },
  {
    id: 'rise-up',
    title: 'Rise Up',
    artist: 'Grow Sounds',
    mood: 'Drive',
    genre: 'Cinematic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  },
  {
    id: 'party-start',
    title: 'Party Start',
    artist: 'Grow Sounds',
    mood: 'Dance',
    genre: 'Dance',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  },
  {
    id: 'dream-wave',
    title: 'Dream Wave',
    artist: 'Grow Sounds',
    mood: 'Ambient',
    genre: 'Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3',
  },

  // —— Free Music Archive (Creative Commons) ——
  {
    id: 'fma-enthusiast',
    title: 'Enthusiast',
    artist: 'Tours',
    mood: 'Upbeat',
    genre: 'Indie',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Tours/Enthusiast/Tours_-_01_-_Enthusiast.mp3',
  },
  {
    id: 'fma-night-owl',
    title: 'Night Owl',
    artist: 'Broke For Free',
    mood: 'Chill',
    genre: 'Hip-Hop',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3',
  },
  {
    id: 'fma-shipping',
    title: 'Shipping Lanes',
    artist: 'Chad Crouch',
    mood: 'Focus',
    genre: 'Ambient',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Shipping_Lanes.mp3',
  },
  {
    id: 'fma-algorithms',
    title: 'Algorithms',
    artist: 'Chad Crouch',
    mood: 'Groove',
    genre: 'Electronic',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Algorithms.mp3',
  },

  // Legacy ids kept so older drafts still resolve
  {
    id: 'energy',
    title: 'Morning Energy',
    artist: 'Grow Sounds',
    mood: 'Upbeat',
    genre: 'Pop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'chill',
    title: 'Calm Focus',
    artist: 'Grow Sounds',
    mood: 'Chill',
    genre: 'Lo-fi',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'motivate',
    title: 'Keep Going',
    artist: 'Grow Sounds',
    mood: 'Drive',
    genre: 'Electronic',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'celebrate',
    title: 'Small Wins',
    artist: 'Grow Sounds',
    mood: 'Feel-good',
    genre: 'Pop',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'pulse',
    title: 'Night Pulse',
    artist: 'Grow Sounds',
    mood: 'Groove',
    genre: 'Dance',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    id: 'rise',
    title: 'Slow Rise',
    artist: 'Grow Sounds',
    mood: 'Ambient',
    genre: 'Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    id: 'spark',
    title: 'Spark Day',
    artist: 'Grow Sounds',
    mood: 'Bright',
    genre: 'Indie',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    id: 'flow',
    title: 'Deep Flow',
    artist: 'Grow Sounds',
    mood: 'Focus',
    genre: 'Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
];

/** Genres shown as filter chips (unique, ordered). */
export const MUSIC_GENRE_FILTERS = [
  'All',
  'Pop',
  'Hip-Hop',
  'Dance',
  'Electronic',
  'Lo-fi',
  'Indie',
  'Ambient',
  'Acoustic',
  'R&B',
  'Cinematic',
] as const;

export function getMusicTrackById(id: string | null | undefined): PostMusicTrack | null {
  if (!id) return null;
  return POST_MUSIC_TRACKS.find((t) => t.id === id) || null;
}

/** Primary library list without duplicate legacy aliases. */
export function getPrimaryMusicTracks(): PostMusicTrack[] {
  const legacy = new Set([
    'energy',
    'chill',
    'motivate',
    'celebrate',
    'pulse',
    'rise',
    'spark',
    'flow',
  ]);
  return POST_MUSIC_TRACKS.filter((t) => !legacy.has(t.id));
}
