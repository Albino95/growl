import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'src/test/reactNativeStub.ts'),
      'expo-image-picker': path.resolve(__dirname, 'src/test/expoImagePickerStub.ts'),
      'expo-video-thumbnails': path.resolve(__dirname, 'src/test/expoVideoThumbnailsStub.ts'),
      'expo-video': path.resolve(__dirname, 'src/test/expoVideoStub.ts'),
      'expo-file-system/legacy': path.resolve(__dirname, 'src/test/expoFileSystemLegacyStub.ts'),
    },
  },
});
