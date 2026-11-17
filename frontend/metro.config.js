// Learn more https://docs.expo.dev/guides/customizing-metro
// Sentry's wrapper adds debug IDs so uploaded source maps match release bundles.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Configure for web builds to handle ES modules properly
config.resolver.sourceExts.push('mjs');
config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

module.exports = config;
