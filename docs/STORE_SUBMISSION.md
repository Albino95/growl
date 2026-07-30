# Store submission checklist

Use this checklist when submitting Growl to the Apple App Store and Google Play.

## Environments & demos

| Build profile (EAS) | API | Demo accounts UI | Notes |
|---------------------|-----|------------------|-------|
| `development` | dev Worker | On | Local/native debug |
| `preview` (QA) | qa Worker | On | TestFlight / internal Play + App Review account |
| `production` | prod Worker | **Off** | Store builds |

**Demo policy:** Keep `demo@growl.app` / `instructor@growl.app` / `business@growl.app` on **dev** and **qa** DBs (`npm run demo:dev` / `demo:qa`). Do **not** seed demos on production. QA App Review: `review@growl.app` / `GrowlReview123!` via `npm run seed:review:qa`.

## Pre-submission

- [ ] Production EAS build (`eas build --profile production`) — native build, not Expo Go
- [ ] App icons and splash assets in `frontend/assets/` (see [MOBILE_BUILD.md](./MOBILE_BUILD.md))
- [ ] `bundleIdentifier` / `package`: `app.growl.mobile`
- [ ] Backend deployed with isolated D1/KV/R2 per env (see `backend/DEPLOY_NEW_CLOUDFLARE_ACCOUNT.md`)
- [ ] Secrets via `wrangler secret put` (JWT_SECRET, STRIPE_*, RESEND_*, OAuth IDs) — never in `wrangler.toml` `[vars]`
- [ ] R2 buckets bound and health shows `r2: connected`
- [ ] `eas.json` submit block filled with real Apple ID / ASC app id / team id / Play service account
- [ ] `SENTRY_DSN` set on preview/production EAS env; run `npx expo install @sentry/react-native` if not installed

## Legal & privacy (required)

- [ ] In-app legal hub: Profile → Legal & Support
- [ ] Hosted policies live at `https://letsgrow.lu` (privacy, terms, delete-account)
- [ ] Privacy Policy URL in store listing
- [ ] Account deletion: Profile → Delete Account
- [ ] Data export available from delete-account flow
- [ ] iOS Privacy Manifest present in `app.config.ts`

## Apple App Store

- [ ] Sign in with Apple enabled (required when Google/Facebook SSO is shown)
- [ ] Apple ID token verified via JWKS on the server
- [ ] `ITSAppUsesNonExemptEncryption: false`
- [ ] Privacy nutrition labels match data collection
- [ ] UGC: report + block flows
- [ ] Age rating questionnaire completed
- [ ] Demo accounts hidden (`SHOW_DEMO_ACCOUNTS=false`)
- [ ] Forgot password works end-to-end

## Google Play

- [ ] Data safety form aligned with Privacy Policy
- [ ] Account deletion URL or in-app flow documented
- [ ] Content rating questionnaire
- [ ] Target API level meets Play requirements (Expo SDK 54)

## Moderation & safety

- [ ] Report post and report user flows working
- [ ] Block user from feed and profiles
- [ ] Admin moderation queue

## Payments (physical goods marketplace)

- [ ] Stripe Checkout + webhook on production (live keys)
- [ ] Test keys only on qa
- [ ] Orders marked paid only via webhook / verified session (not client `payment_confirmed`)
- [ ] Checkout links to Terms and Privacy
- [ ] Refund policy documented
- [ ] Digital goods / subscriptions → future RevenueCat / IAP (out of scope for v1 physical marketplace)

## Stubs gated for store builds

- [ ] KYC disabled (`ENABLE_KYC=false`)
- [ ] Push prefs show “coming soon” until `ENABLE_PUSH_PREFS=true` + `expo-notifications`
- [ ] Reels/Clips labeled as photo posts (not video)

## Testing before submit

1. Sign up / verify email / sign in / forgot password / SSO
2. Create post, report post, block user
3. Export and delete test account
4. Open Legal from Profile, Biz Settings, Checkout
5. Stripe checkout on qa → webhook marks order paid → deep link `growl://checkout/success`
6. Confirm deleted user cannot authenticate
7. QA demos still work on preview build

## Support contacts

- Support: support@letsgrow.lu
- Privacy: privacy@letsgrow.lu
- Legal: legal@letsgrow.lu

## Submit

```bash
cd frontend
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Update `eas.json` `submit.production` with your Apple ID, ASC App ID, team ID, and Play service account path before running.
