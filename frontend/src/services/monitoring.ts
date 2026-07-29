import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { SENTRY_DSN?: string };

let initialized = false;

/** Init Sentry when SENTRY_DSN is present (qa/production EAS builds). */
export function initMonitoring(): void {
  if (initialized) return;
  const dsn = extra.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    // Optional peer — install with: cd frontend && npx expo install @sentry/react-native
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn,
      enableInExpoDevelopment: false,
      tracesSampleRate: 0.2,
    });
    initialized = true;
  } catch (err) {
    console.warn('[monitoring] Sentry not installed or failed to init', err);
  }
}
