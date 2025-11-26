import type { ExpoConfig } from '@expo/config';
const defineConfig = (): ExpoConfig => ({
  name: 'Growl',
  slug: 'growl',
  version: '0.4.0',
  extra: {
    API_BASE_URL: process.env.API_BASE_URL ?? 'https://api.example.com',
    ENV: process.env.NODE_ENV ?? 'development',
  },
});
export default defineConfig;
