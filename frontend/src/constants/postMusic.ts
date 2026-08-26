export type PostMusicTrack = {
  id: string;
  title: string;
  artist: string;
  /** Royalty-free demo preview URLs for soundtracks */
  url: string;
  /** Short mood tag shown in pickers */
  mood?: string;
};

/** Shared public music library for posts + reels (Instagram-style picker). */
export const POST_MUSIC_TRACKS: PostMusicTrack[] = [
  {
    id: 'energy',
    title: 'Morning Energy',
    artist: 'Grow Sounds',
    mood: 'Upbeat',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'chill',
    title: 'Calm Focus',
    artist: 'Grow Sounds',
    mood: 'Chill',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'motivate',
    title: 'Keep Going',
    artist: 'Grow Sounds',
    mood: 'Drive',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'celebrate',
    title: 'Small Wins',
    artist: 'Grow Sounds',
    mood: 'Feel-good',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  {
    id: 'pulse',
    title: 'Night Pulse',
    artist: 'Grow Sounds',
    mood: 'Groove',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  {
    id: 'rise',
    title: 'Slow Rise',
    artist: 'Grow Sounds',
    mood: 'Ambient',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  {
    id: 'spark',
    title: 'Spark Day',
    artist: 'Grow Sounds',
    mood: 'Bright',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  {
    id: 'flow',
    title: 'Deep Flow',
    artist: 'Grow Sounds',
    mood: 'Focus',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
];

export function getMusicTrackById(id: string | null | undefined): PostMusicTrack | null {
  if (!id) return null;
  return POST_MUSIC_TRACKS.find((t) => t.id === id) || null;
}
