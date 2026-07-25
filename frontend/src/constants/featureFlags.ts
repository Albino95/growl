import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

/**
 * Production EAS sets SHOW_DEMO_ACCOUNTS=false.
 * Preview (qa) and development keep demos available for QA.
 */
export const featureFlags = {
  showDemoAccounts: __DEV__ || extra.SHOW_DEMO_ACCOUNTS === true,
  showDevVerificationHint: __DEV__ || extra.SHOW_DEV_TOOLS === true,
  enableKYC: extra.ENABLE_KYC === true,
  /** Hide push prefs until expo-notifications is wired */
  enablePushPrefs: extra.ENABLE_PUSH_PREFS === true,
  appEnv: String(extra.APP_ENV || extra.ENV || 'development'),
} as const;
