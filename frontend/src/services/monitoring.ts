import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { SENTRY_DSN?: string; APP_ENV?: string };

let initialized = false;

/** Init Sentry when SENTRY_DSN is present (qa/production EAS builds). */
export function initMonitoring(): void {
  if (initialized) return;
  const dsn = extra.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    // Loaded lazily so builds without a DSN never touch the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native') as typeof import('@sentry/react-native');
    Sentry.init({
      dsn,
      environment: extra.APP_ENV || 'development',
      // Crash and error reports only; never attach IPs, cookies or user emails.
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
    });
    initialized = true;
  } catch (err) {
    console.warn('[monitoring] Sentry not installed or failed to init', err);
  }
}
