export type PostMusicTrack = {
  id: string;
  title: string;
  artist: string;
  /** Royalty-free demo preview URLs for post soundtracks */
  url: string;
};

export const POST_MUSIC_TRACKS: PostMusicTrack[] = [
  {
    id: 'energy',
    title: 'Morning Energy',
    artist: 'Growl Sounds',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  {
    id: 'chill',
    title: 'Calm Focus',
    artist: 'Growl Sounds',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  {
    id: 'motivate',
    title: 'Keep Going',
    artist: 'Growl Sounds',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  {
    id: 'celebrate',
    title: 'Small Wins',
    artist: 'Growl Sounds',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
];
