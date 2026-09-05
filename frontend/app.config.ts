import type { ExpoConfig } from '@expo/config';

/**
 * Native builds (EAS / Xcode / Android Studio) — not Expo Go.
 * Set API_BASE_URL / OAuth / Sentry via EAS profile env or local shell when prebuilding.
 */
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

const defineConfig = (): ExpoConfig => ({
  name: 'Grow!',
  slug: 'growl',
  version: '0.4.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'growl',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#F3EEE4',
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.growl.mobile',
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: 'Grow! uses the camera so you can take photos and videos for posts, stories, reels, and your profile.',
      NSPhotoLibraryUsageDescription:
        'Grow! accesses your photo library so you can share photos and videos with your growth community.',
      NSPhotoLibraryAddUsageDescription: 'Grow! may save images you export from your account.',
      NSMicrophoneUsageDescription: 'Grow! uses the microphone when you record video for reels.',
    },
    usesAppleSignIn: true,
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
    },
  },
  android: {
    package: 'app.growl.mobile',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#059669',
    },
    permissions: ['CAMERA', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'RECORD_AUDIO'],
    blockedPermissions: ['android.permission.AD_ID'],
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
    name: 'Grow!',
    shortName: 'Grow!',
    lang: 'en',
    description: 'Grow! — grow by scrolling with purpose.',
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
        cameraPermission:
          'Grow! uses the camera so you can take photos and videos for posts, stories, and reels.',
        microphonePermission:
          'Grow! uses the microphone when you record video for reels and stories.',
        recordAudioAndroid: true,
      },
    ],
    'expo-apple-authentication',
  ],
  extra: {
    API_BASE_URL:
      process.env.API_BASE_URL ||
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      'https://growl-backend-qa.wispy-leaf-4e8b.workers.dev/api/v1',
    APP_ENV: appEnv,
    ENV: appEnv,
    SHOW_DEMO_ACCOUNTS: process.env.SHOW_DEMO_ACCOUNTS === 'true',
    SHOW_DEV_TOOLS: process.env.SHOW_DEV_TOOLS === 'true',
    ENABLE_KYC: process.env.ENABLE_KYC === 'true',
    ENABLE_PUSH_PREFS: process.env.ENABLE_PUSH_PREFS === 'true',
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
