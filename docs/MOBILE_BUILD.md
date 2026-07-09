# Mobile build guide

This document covers native iOS/Android builds for Growl using EAS Build.

## Prerequisites

- Node.js ≥ 20.19.4
- [EAS CLI](https://docs.expo.dev/build/setup/): `npm install -g eas-cli`
- Expo account and Apple Developer / Google Play accounts for store submission
- Run `npm install` in `frontend/` (includes `expo-apple-authentication`)

## App identifiers

Configured in `frontend/app.config.ts`:

| Platform | Field | Value |
|----------|-------|-------|
| iOS | `bundleIdentifier` | `app.growl.mobile` |
| Android | `package` | `app.growl.mobile` |
| Deep link | `scheme` | `growl` |
| Encryption | `ITSAppUsesNonExemptEncryption` | `false` |

## Assets

Placeholder brand assets are committed under `frontend/assets/` (`icon.png`, `splash.png`, `adaptive-icon.png`, `favicon.png`). Replace with final brand artwork before store submission.

| File | Size | Notes |
|------|------|-------|
| `icon.png` | 1024×1024 | App Store icon |
| `splash.png` | 1284×2778 | Launch screen |
| `adaptive-icon.png` | 1024×1024 | Android foreground |
| `favicon.png` | 48×48 | Web |

## Device acceptance testing

Before submitting, verify on **iOS simulator**, **Android emulator**, and **one physical device**:

1. **Feed** — For You sections load; suggested posts appear for new users with categories
2. **Explore** — All sections render (stories, shop picks, posts grid, people, reels) or show CTAs
3. **Marketplace** — Carousel, filters, product detail gallery + related products; checkout gated without Stripe
4. **Journal** — Public community tab + private tab CRUD; report on others' public entries
5. **Messages** — Friend threads only; Message CTA on friend profiles
6. **Profile** — Edit profile, notification prefs, legal hub, delete account + export
7. **Auth** — Sign in with Apple on iOS; no demo accounts in production build

See [STORE_SUBMISSION.md](./STORE_SUBMISSION.md) for the full checklist.

## EAS profiles

See `frontend/eas.json`:

- **development** — dev client, iOS simulator
- **preview** — internal distribution (APK on Android)
- **production** — store builds; demo accounts disabled via env

## Build commands

```bash
cd frontend
eas login
eas build:configure   # first time only
eas build --profile preview --platform ios
eas build --profile production --platform all
```

## Environment variables

Set in EAS secrets or `eas.json` production env:

- `API_BASE_URL` — production API
- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`
- `FACEBOOK_APP_ID`
- `EAS_PROJECT_ID`

Production builds set `SHOW_DEMO_ACCOUNTS=false` and `SHOW_DEV_TOOLS=false` automatically.

## OAuth redirect

OAuth uses `makeRedirectUri({ scheme: 'growl', path: 'oauth' })`. Register `growl://oauth` (and your Expo auth proxy if used) in Google/Facebook console.

## Sign in with Apple

- iOS plugin: `expo-apple-authentication` in `app.config.ts` plugins
- Enable **Sign in with Apple** capability in Apple Developer for `app.growl.mobile`
- Set backend secret: `wrangler secret put APPLE_CLIENT_ID`

## Local development

```bash
cd frontend && npm start
```

Demo accounts appear only in `__DEV__` or when `SHOW_DEMO_ACCOUNTS=true` in app config extra.
