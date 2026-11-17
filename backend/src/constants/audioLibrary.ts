/**
 * Royalty-free soundtrack library (allowlisted for proxy).
 * Keep IDs in sync with frontend/src/constants/postMusic.ts
 */
export const AUDIO_LIBRARY: Record<
  string,
  { title: string; url: string }
> = {
  // Free Music Archive (CORS-friendly upstream)
  'fma-enthusiast': {
    title: 'Enthusiast',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Tours/Enthusiast/Tours_-_01_-_Enthusiast.mp3',
  },
  'fma-night-owl': {
    title: 'Night Owl',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/WFMU/Broke_For_Free/Directionless_EP/Broke_For_Free_-_01_-_Night_Owl.mp3',
  },
  'fma-shipping': {
    title: 'Shipping Lanes',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Shipping_Lanes.mp3',
  },
  'fma-algorithms': {
    title: 'Algorithms',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Algorithms.mp3',
  },
  'fma-starling': {
    title: 'Starling',
    url: 'https://files.freemusicarchive.org/storage-freemusicarchive-org/music/Music_for_Video/Podington_Bear/Solo_Instruments/Podington_Bear_-_Starling.mp3',
  },

  // Samplelib demos (CORS *)
  'pulse-15': {
    title: 'Pulse Drop',
    url: 'https://download.samplelib.com/mp3/sample-15s.mp3',
  },
  'pulse-12': {
    title: 'Short Groove',
    url: 'https://download.samplelib.com/mp3/sample-12s.mp3',
  },
  'pulse-9': {
    title: 'Quick Hit',
    url: 'https://download.samplelib.com/mp3/sample-9s.mp3',
  },
  'pulse-6': {
    title: 'Snap Beat',
    url: 'https://download.samplelib.com/mp3/sample-6s.mp3',
  },

  // SoundHelix — proxied because upstream has no CORS (breaks web Audio)
  energy: {
    title: 'Chart Energy',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  'chart-energy': {
    title: 'Chart Energy',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  },
  chill: {
    title: 'Summer Anthem',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  'summer-anthem': {
    title: 'Summer Anthem',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  },
  motivate: {
    title: 'Night Drive',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  'night-drive': {
    title: 'Night Drive',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
  },
  celebrate: {
    title: 'Club Pulse',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  'club-pulse': {
    title: 'Club Pulse',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
  },
  pulse: {
    title: 'Trap Flex',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  'trap-flex': {
    title: 'Trap Flex',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
  },
  rise: {
    title: 'Lo-fi Study',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  'lofi-study': {
    title: 'Lo-fi Study',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
  },
  spark: {
    title: 'Indie Glow',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  'indie-glow': {
    title: 'Indie Glow',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
  },
  flow: {
    title: 'Deep Focus',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  'deep-focus': {
    title: 'Deep Focus',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
  },
  'workout-fire': {
    title: 'Workout Fire',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
  },
  'soft-morning': {
    title: 'Soft Morning',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
  },
  'city-lights': {
    title: 'City Lights',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
  },
  'viral-hook': {
    title: 'Viral Hook',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
  },
  'late-night': {
    title: 'Late Night',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
  },
  'rise-up': {
    title: 'Rise Up',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
  },
  'party-start': {
    title: 'Party Start',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
  },
  'dream-wave': {
    title: 'Dream Wave',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3',
  },
};
