import type { ExpoConfig } from '@expo/config';

/**
 * Native builds (EAS / Xcode / Android Studio) — not Expo Go.
 * Set API_BASE_URL / OAuth / Sentry via EAS profile env or local shell when prebuilding.
 */
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

const defineConfig = (): ExpoConfig => ({
  name: 'Growl',
  slug: 'growl',
  version: '0.4.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'growl',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.growl.mobile',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    usesAppleSignIn: true,
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  android: {
    package: 'app.growl.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: false,
        data: [{ scheme: 'growl' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    favicon: './assets/favicon.png',
    output: 'single',
    name: 'Growl',
    shortName: 'Growl',
    lang: 'en',
    description: 'Growl - Your personal growth companion',
  },
  plugins: [
    [
      'expo-image-picker',
      {
        photosPermission:
          'The app accesses your photos to let you share them with your growth community.',
        cameraPermission: 'The app accesses your camera to let you take photos for your posts.',
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'The app accesses your camera to let you take photos for your posts.',
      },
    ],
    'expo-apple-authentication',
  ],
  extra: {
    API_BASE_URL:
      process.env.API_BASE_URL ||
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://growl-backend.albino-ndreu.workers.dev/api/v1',
    APP_ENV: appEnv,
    ENV: appEnv,
    SHOW_DEMO_ACCOUNTS: process.env.SHOW_DEMO_ACCOUNTS === 'true',
    SHOW_DEV_TOOLS: process.env.SHOW_DEV_TOOLS === 'true',
    // Default ON so business tooling is available; set ENABLE_*=false to gate off
    ENABLE_KYC: process.env.ENABLE_KYC !== 'false',
    ENABLE_PUSH_PREFS: process.env.ENABLE_PUSH_PREFS !== 'false',
    SENTRY_DSN: process.env.SENTRY_DSN,
    googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
    facebookAppId: process.env.FACEBOOK_APP_ID,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});

export default defineConfig;
