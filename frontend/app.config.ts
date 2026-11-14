import type { ExpoConfig } from '@expo/config';

/**
 * Native builds (EAS / Xcode / Android Studio) — not Expo Go.
 * Set API_BASE_URL / OAuth / Sentry via EAS profile env or local shell when prebuilding.
 */
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

// iOS permission prompts. Defined once so the image-picker / camera plugins
// can't silently replace them with generic text (Apple reviews these).
const CAMERA_PERMISSION =
  'Grow! uses the camera so you can take photos and record videos for your posts, stories, reels, and profile picture.';
const MICROPHONE_PERMISSION =
  'Grow! uses the microphone to record sound when you film videos for reels and stories.';
const PHOTOS_PERMISSION =
  'Grow! accesses your photo library so you can choose photos and videos to share in posts, stories, reels, and your profile.';
const PHOTOS_ADD_PERMISSION = 'Grow! saves photos and videos you choose to export to your photo library.';

const defineConfig = (): ExpoConfig => ({
  name: 'Grow!',
  slug: 'growl',
  version: '0.4.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'growl',
  // Stays 'light' while DARK_MODE_READY (src/theme/appearance.ts) is false.
  // When phase 2 flips it, switch to 'automatic' so iOS reports the system
  // scheme to Appearance and native chrome (alerts, pickers, keyboard) follows.
  // Android: 'automatic' needs expo-system-ui (NOT installed yet — adding it is
  // a native change that requires a new build).
  userInterfaceStyle: 'automatic',
  // Native cold-start: the brand mark (cream leaf + smile, transparent) centred
  // at 128pt on emerald. BrandLoadingScreen draws the same mark at the same rect
  // (centre of the full window, 128×128) so the JS handoff is seamless.
  // Must stay in sync with the expo-splash-screen plugin block below.
  splash: {
    image: './assets/splash-mark.png',
    imageWidth: 128,
    resizeMode: 'contain',
    backgroundColor: '#049669',
  },
  // Launch with light icons over the emerald splash; expo-status-bar takes over in JS.
  // backgroundColor is what the splash plugin already injects (it copies
  // splash.backgroundColor and warns on a mismatch) — stated here so it's explicit.
  androidStatusBar: {
    barStyle: 'light-content',
    backgroundColor: '#049669',
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.growl.mobile',
    // Team + App Group shared with the Today widget (targets/widget).
    appleTeamId: 'TWA9YR63J2',
    entitlements: {
      'com.apple.security.application-groups': ['group.app.growl.mobile'],
    },
    buildNumber: '2',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Light status bar over the emerald launch screen (JS switches it at reveal).
      UIStatusBarStyle: 'UIStatusBarStyleLightContent',
      NSCameraUsageDescription: CAMERA_PERMISSION,
      NSPhotoLibraryUsageDescription: PHOTOS_PERMISSION,
      NSPhotoLibraryAddUsageDescription: PHOTOS_ADD_PERMISSION,
      NSMicrophoneUsageDescription: MICROPHONE_PERMISSION,
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
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#049669',
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
    description: 'Grow! — unlock skills and share your growth.',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#049669',
        image: './assets/splash-mark.png',
        imageWidth: 128,
        resizeMode: 'contain',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: PHOTOS_PERMISSION,
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: MICROPHONE_PERMISSION,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: CAMERA_PERMISSION,
        microphonePermission: MICROPHONE_PERMISSION,
        recordAudioAndroid: true,
      },
    ],
    'expo-apple-authentication',
    [
      'expo-notifications',
      {
        // Local reminders only (no remote push yet).
        color: '#059669',
      },
    ],
    // Home-screen widget extension lives in targets/widget.
    '@bacons/apple-targets',
    [
      '@sentry/react-native/expo',
      {
        organization: 'grow-inc',
        project: 'grow-mobile',
        url: 'https://de.sentry.io/',
      },
    ],
    [
      'expo-video',
      {
        supportsBackgroundPlayback: false,
        supportsPictureInPicture: false,
      },
    ],
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
      projectId: 'b2daa524-631c-46b5-97ab-387b39b111be',
    },
  },
});

export default defineConfig;
