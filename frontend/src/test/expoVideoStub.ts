function makePlayer() {
  return {
    play: () => undefined,
    pause: () => undefined,
    release: () => undefined,
    replaceAsync: async () => undefined,
    generateThumbnailsAsync: async (times: number | number[]) => {
      const list = Array.isArray(times) ? times : [times];
      return list.map((t) => ({
        uri: `file://thumb-${Math.round(t * 1000)}.jpg`,
        width: 80,
        height: 80,
      }));
    },
    loop: false,
    muted: false,
    volume: 1,
    playbackRate: 1,
    currentTime: 0,
    duration: 0,
    status: 'readyToPlay',
    audioMixingMode: 'mixWithOthers',
    staysActiveInBackground: false,
    showNowPlayingNotification: false,
    timeUpdateEventInterval: 0,
    addListener: (
      _event: string,
      cb: (payload: { status: string }) => void
    ) => {
      queueMicrotask(() => cb({ status: 'readyToPlay' }));
      return { remove: () => undefined };
    },
  };
}

export function useVideoPlayer() {
  return makePlayer();
}

export function createVideoPlayer() {
  return makePlayer();
}

export function VideoView() {
  return null;
}
