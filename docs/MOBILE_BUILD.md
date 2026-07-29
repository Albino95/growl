# Mobile build guide

Growl is an **Expo SDK 54** project built as a **native app** (EAS Build, Xcode, or Android Studio). Day-to-day work is **not** Expo Go — build a development client or release binary and fix errors from the native runtime.

## Prerequisites

- Node.js ≥ 20.19.4
- [EAS CLI](https://docs.expo.dev/build/setup/): `npm install -g eas-cli`
- Apple Developer / Google Play accounts for store submission
- `cd frontend && npm install` (includes `@sentry/react-native` when using crash reporting)

## App identifiers

Configured in `frontend/app.config.ts` (canonical — `app.json` is a stub):

| Platform | Field | Value |
|----------|-------|-------|
| iOS | `bundleIdentifier` | `app.growl.mobile` |
| Android | `package` | `app.growl.mobile` |
| Deep link | `scheme` | `growl` |
| Encryption | `ITSAppUsesNonExemptEncryption` | `false` |

## Native build workflows

### EAS (recommended)

```bash
cd frontend
eas login
eas build:configure   # first time

# Dev client (simulator / device)
npm run eas:build:dev

# QA / TestFlight / internal Play — demos ON
npm run eas:build:qa

# Store candidate — demos OFF
npm run eas:build:prod
```

Point profiles at the correct Workers via `eas.json` `env.API_BASE_URL` (update hosts after company Cloudflare cutover).

### Local Xcode / Android Studio

```bash
cd frontend
# Ensure API_BASE_URL matches the Worker you are hitting
API_BASE_URL=https://growl-backend-qa..../api/v1 npx expo prebuild
# Then open ios/ in Xcode or android/ in Android Studio and Run
```

Read build/runtime logs in Xcode / Logcat — that is the primary debug loop.

## EAS profile matrix

| Profile | Purpose | Demos | Typical API |
|---------|---------|-------|-------------|
| `development` | Dev client | Yes | `growl-backend-dev` |
| `preview` | QA / review | Yes | `growl-backend-qa` |
| `production` | App Store / Play | No | `growl-backend-production` |

Also set: OAuth client IDs, `EAS_PROJECT_ID`, `SENTRY_DSN` (qa/prod).

## Deep links

- Auth OAuth: `growl://oauth`
- Password reset email: `growl://reset-password?...`
- Stripe return: `growl://checkout/success`, `growl://checkout/cancel`

## Device acceptance testing

1. Auth — email, verify, forgot password, Apple SSO (iOS)
2. Feed / Explore / Journal / Messages / Marketplace
3. Checkout on qa with Stripe test keys + webhook
4. Legal + delete account + export
5. Confirm production build hides demo account buttons

See [STORE_SUBMISSION.md](./STORE_SUBMISSION.md).

## Submit

Fill `eas.json` submit credentials, then:

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```
