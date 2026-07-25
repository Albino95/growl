import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/** Production builds should keep demo/dev surfaces off unless explicitly enabled in app config. */
export const featureFlags = {
  showDemoAccounts: __DEV__ || extra.SHOW_DEMO_ACCOUNTS === true,
  showDevVerificationHint: __DEV__ || extra.SHOW_DEV_TOOLS === true,
  enableKYC: extra.ENABLE_KYC === true,
} as const;
