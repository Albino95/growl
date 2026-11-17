import { useEffect, useState } from 'react';

type NetInfoModule = typeof import('@react-native-community/netinfo').default;

/**
 * NetInfo is a native module: a dev client built before it was added has no
 * native side, so load it defensively and report "online" if unavailable.
 */
let netInfo: NetInfoModule | null | undefined;
function getNetInfo(): NetInfoModule | null {
  if (netInfo !== undefined) return netInfo;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-community/netinfo');
    netInfo = (mod?.default ?? mod) as NetInfoModule;
  } catch {
    netInfo = null;
  }
  return netInfo;
}

export type NetworkStatus = {
  /** True only when we know we're offline; unknown states count as online. */
  isOffline: boolean;
};

export function useNetworkStatus(): NetworkStatus {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const NetInfo = getNetInfo();
    if (!NetInfo) return undefined;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NetInfo.addEventListener((state) => {
        // isInternetReachable is null while unknown — don't flash the banner.
        setIsOffline(state.isConnected === false || state.isInternetReachable === false);
      });
    } catch {
      return undefined;
    }
    return () => unsubscribe?.();
  }, []);

  return { isOffline };
}
