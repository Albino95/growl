# Store submission checklist

Use this when submitting **Grow!** to the Apple App Store and Google Play.

Store listing URLs (after the apps are live):

- Privacy: https://letsgrow.lu/privacy
- Terms: https://letsgrow.lu/terms
- Delete account: https://letsgrow.lu/delete-account
- Support: support@letsgrow.lu

## Environments & demos

| Build profile (EAS) | API | Demo accounts UI | Notes |
|---------------------|-----|------------------|-------|
| `development` | dev Worker | On | Local/native debug |
| `preview` (QA) | qa Worker | On | TestFlight / internal Play + App Review account |
| `production` | prod Worker | **Off** | Store builds |

**Demo policy:** Keep `demo@growl.app` / `instructor@growl.app` / `business@growl.app` on **dev** and **qa** DBs (`npm run demo:dev` / `demo:qa`). Do **not** seed demos on production. QA App Review: `review@growl.app` / `GrowlReview123!` via `npm run seed:review:qa`.

## Code already in the repo

- Bundle ID / package: `app.growl.mobile`
- Display name: `Grow!`
- Deep link scheme: `growl`
- `ITSAppUsesNonExemptEncryption: false`
- iOS privacy manifest (UserDefaults, file timestamp, disk space, boot time)
- Camera / photo library usage strings
- Android Advertising ID blocked (no ads)
- KYC and push prefs **off** unless explicitly enabled
- Demo buttons only when `SHOW_DEMO_ACCOUNTS=true` (preview/dev)
- Google/Facebook buttons hidden until client IDs are set
- In-app Legal hub + Delete Account + data export
- Hosted legal pages on the landing site (`/privacy`, `/terms`, `/delete-account`)
- UGC report + block flows
- Sign in with Apple plugin (iOS)
- Unverified signups kept 24h then purged

## You still must do (accounts / stores / secrets)

These cannot be finished in git alone:

### Apple

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) (~€99/year).
2. Create the App Store Connect app with bundle ID `app.growl.mobile`.
3. Fill `frontend/eas.json` `submit.production.ios` with your Apple ID, ASC App ID, and Team ID.
4. App Store listing: name **Grow!**, screenshots (6.7" and 6.1" iPhone; iPad if `supportsTablet` stays true), description, keywords, support URL `https://letsgrow.lu/support`, marketing URL `https://letsgrow.lu`, privacy URL `https://letsgrow.lu/privacy`.
5. Age rating questionnaire (recommend 13+).
6. Privacy nutrition labels: email, user content, identifiers (account), purchase history if Stripe is live, crash data if Sentry DSN is set.
7. Review notes: QA login `review@growl.app` / `GrowlReview123!` on the **preview** build, or a production test account you create.
8. Export compliance: the app already declares non-exempt encryption is **not** used.

### Google Play

1. Play Console developer account (~€25 one-time).
2. Create app with package `app.growl.mobile`.
3. Put a Play service-account JSON at `frontend/google-play-service-account.json` (gitignored) and keep `track: internal` until you promote.
4. Data safety form: account info, user-generated content, photos, purchase history (if Stripe live), crash logs (if Sentry). Account deletion: in-app + https://letsgrow.lu/delete-account.
5. Content rating questionnaire.
6. Store listing: screenshots, feature graphic (1024×500), short/full description, privacy URL.

### Production backend

```bash
cd backend
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put EMAIL_FROM --env production   # Grow! <noreply@letsgrow.lu>
npx wrangler secret put APP_PUBLIC_URL --env production  # https://letsgrow.lu
# When payments go live (live keys only):
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
npx wrangler secret put APPLE_CLIENT_ID --env production   # if using Sign in with Apple
npx wrangler secret put GOOGLE_CLIENT_ID --env production  # if showing Google SSO
npx wrangler secret put FACEBOOK_APP_ID --env production   # if showing Facebook SSO

npm run migrate:production
npm run deploy:production
# Do NOT run demo: on production
```

Confirm `GET https://growl-backend-production.wispy-leaf-4e8b.workers.dev/api/v1/health` shows `database`, `kv`, `r2`, `jwtConfigured`.

Optional: attach custom domain `api.letsgrow.lu`.

### EAS / native

1. `cd frontend && eas login` then set `EAS_PROJECT_ID` (or run `eas build:configure`).
2. Optional: `SENTRY_DSN` on preview + production EAS env.
3. Production OAuth client IDs in EAS secrets if you want Google/Facebook on the store build. If you enable them on **iOS**, Sign in with Apple must stay visible (already required).
4. Rebuild icons if you want the home-screen name/icon to match final branding (current files: `frontend/assets/icon.png`, `adaptive-icon.png`, `splash.png`).
5. `eas build --profile production` then `eas submit --platform ios|android --profile production`.

### Landing deploy

Redeploy the landing site so `/privacy`, `/terms`, and `/delete-account` are live on https://letsgrow.lu **before** you submit. Apple and Google will crawl those URLs.

## Testing before submit

1. Sign up / verify email / sign in / forgot password / Apple SSO (iOS)
2. Create post, report post, block user
3. Export and delete a test account
4. Open Legal from Profile, Biz Settings, Checkout — and open https://letsgrow.lu/privacy in a browser
5. Stripe checkout on qa → webhook marks order paid → `growl://checkout/success`
6. Confirm a deleted user cannot authenticate
7. Production build hides demo account buttons
8. QA demos still work on the preview build

## Payments

- Stripe test keys on qa only
- Live keys on production when the marketplace is ready
- Digital goods / subscriptions stay out of v1 (no IAP required for physical goods)
