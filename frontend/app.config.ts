import type { ExpoConfig } from '@expo/config';
const defineConfig = (): ExpoConfig => ({
  name: 'Growl',
  slug: 'growl',
  version: '0.4.0',
  extra: {
    API_BASE_URL: process.env.API_BASE_URL ?? 'https://growl-backend.albino-ndreu.workers.dev/api/v1',
    ENV: process.env.NODE_ENV ?? 'development',
  },
});
export default defineConfig;
