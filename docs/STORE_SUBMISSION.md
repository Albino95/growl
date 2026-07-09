# Store submission checklist

Use this checklist when submitting Growl to the Apple App Store and Google Play.

## Pre-submission

- [ ] Production EAS build (`eas build --profile production`)
- [ ] App icons and splash assets in `frontend/assets/` (see [MOBILE_BUILD.md](./MOBILE_BUILD.md))
- [ ] `bundleIdentifier` / `package`: `app.growl.mobile`
- [ ] Backend deployed with `ENVIRONMENT=production`
- [ ] Secrets set via `wrangler secret put` (JWT_SECRET, STRIPE_*, GOOGLE_CLIENT_ID, APPLE_CLIENT_ID)
- [ ] R2 bucket `growl-media` created in Cloudflare dashboard

## Legal & privacy (required)

- [ ] In-app legal hub: Profile → Legal & Support
- [ ] Hosted policies: `frontend/public/privacy.html`, `terms.html` (deploy with web app)
- [ ] Privacy Policy URL in store listing
- [ ] Account deletion: Profile → Delete Account (`POST /api/v1/privacy/delete-account`)
- [ ] Data export: Profile → Delete Account → Export (`GET /api/v1/privacy/export`)

## Apple App Store

- [ ] **Sign in with Apple** enabled (required when Google/Facebook SSO is shown)
- [ ] `ITSAppUsesNonExemptEncryption: false` in app config (or export compliance docs if true)
- [ ] Privacy nutrition labels match data collection (email, user content, identifiers)
- [ ] UGC: report flow on feed post menu and public profiles
- [ ] Age rating questionnaire completed
- [ ] Demo accounts hidden in production (`featureFlags.showDemoAccounts`)

## Google Play

- [ ] Data safety form aligned with Privacy Policy
- [ ] Account deletion URL or in-app flow documented
- [ ] Content rating questionnaire
- [ ] Target API level meets Play requirements (Expo SDK 54)

## Moderation & safety

- [ ] Report post (`targetType: post`) and report user flows working
- [ ] Block user from feed and profiles
- [ ] Admin moderation queue (`/admin/moderation/reports`)

## Payments (if marketplace enabled)

- [ ] Stripe keys in production
- [ ] Checkout links to Terms and Privacy
- [ ] Refund policy documented for physical goods

## Testing before submit

1. Sign up / sign in (email + SSO)
2. Create post, report post, block user
3. Export and delete test account
4. Open Legal documents from Profile, Biz Settings, Checkout
5. Verify deleted user cannot authenticate

## Support contacts

- Support: support@growl.app
- Privacy: privacy@growl.app
- Legal: legal@growl.app

## Submit

```bash
cd frontend
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

Update `eas.json` `submit.production` with your Apple ID, ASC App ID, team ID, and Play service account path.
