import type { ExpoConfig } from '@expo/config';
const defineConfig = (): ExpoConfig => ({
  name: 'Growl',
  slug: 'growl',
  version: '0.4.0',
  extra: {
    API_BASE_URL: process.env.API_BASE_URL ?? 'https://growl-backend.albino-ndreu.workers.dev/api/v1',
    ENV: process.env.NODE_ENV ?? 'development',
    // OAuth (optional — required for Google/Facebook buttons)
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    facebookAppId: process.env.FACEBOOK_APP_ID,
  },
});
export default defineConfig;
