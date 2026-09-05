import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

function truthyFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function flagEnabled(key: string, defaultOn: boolean): boolean {
  const v = extra[key];
  if (v === false || v === 'false') return false;
  if (truthyFlag(v)) return true;
  return defaultOn;
}

/**
 * App capability flags.
 * KYC + push prefs stay off unless an EAS profile sets ENABLE_*=true.
 */
export const featureFlags = {
  showDemoAccounts: __DEV__ || truthyFlag(extra.SHOW_DEMO_ACCOUNTS),
  showDevVerificationHint: __DEV__ || truthyFlag(extra.SHOW_DEV_TOOLS),
  enableKYC: flagEnabled('ENABLE_KYC', false),
  enablePushPrefs: flagEnabled('ENABLE_PUSH_PREFS', false),
  appEnv: String(extra.APP_ENV || extra.ENV || 'development'),
} as const;
