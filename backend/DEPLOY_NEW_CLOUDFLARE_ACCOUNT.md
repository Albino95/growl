# Deploy Growl Backend to a New Cloudflare Account

This guide moves deployment ownership to a company Cloudflare account and sets up isolated **dev**, **qa**, and **production** environments.

**Demo policy:** Seed demos on **dev** and **qa** only (`npm run demo:dev` / `demo:qa`). Never run `demo:remote` against production. QA also gets `review@growl.app` via `seed:review:qa` for App Store / Play review.

**Legacy `staging` env is removed** — use `qa` for pre-release.

## 1) Authenticate against the new account

```bash
cd backend
npx wrangler logout
npx wrangler login
npx wrangler whoami
```

Confirm the account shown by `whoami` is the target account.

## 2) Create one D1 database per environment

```bash
npm run db:create:envs
# or:
npx wrangler d1 create growl-db-dev
npx wrangler d1 create growl-db-qa
npx wrangler d1 create growl-db-prod
```

Copy each `database_id` into `wrangler.toml` under `[[env.dev.d1_databases]]`, `[[env.qa.d1_databases]]`, `[[env.production.d1_databases]]`.

## 3) Create one KV namespace per environment

```bash
npx wrangler kv namespace create KV_DEV
npx wrangler kv namespace create KV_QA
npx wrangler kv namespace create KV_PROD
```

Copy each namespace `id` into the matching `[[env.*.kv_namespaces]]` blocks.

## 4) Enable R2 and create buckets

In the Cloudflare dashboard: R2 → enable → create:

- `growl-media-dev`
- `growl-media-qa`
- `growl-media-prod`

Uncomment the `[[env.*.r2_buckets]]` (and local `[[r2_buckets]]`) blocks in `wrangler.toml`.

## 5) Secrets per environment

Never put secrets in `[vars]`. Copy `.dev.vars.example` → `.dev.vars` for local.

```bash
for ENV in dev qa production; do
  npx wrangler secret put JWT_SECRET --env $ENV
  npx wrangler secret put RESEND_API_KEY --env $ENV
  npx wrangler secret put EMAIL_FROM --env $ENV
  npx wrangler secret put APP_PUBLIC_URL --env $ENV
  # Optional until payments / SSO go live:
  # npx wrangler secret put STRIPE_SECRET_KEY --env $ENV
  # npx wrangler secret put STRIPE_WEBHOOK_SECRET --env $ENV
  # npx wrangler secret put GOOGLE_CLIENT_ID --env $ENV
  # npx wrangler secret put APPLE_CLIENT_ID --env $ENV
  # npx wrangler secret put FACEBOOK_APP_ID --env $ENV
done
```

Use **test** Stripe keys on qa; **live** keys only on production.

## 6) CORS

`CORS_ORIGINS` is a comma-separated allowlist in `[vars]` / env vars. Production defaults to `https://growl.app,https://www.growl.app,https://admin.growl.app`. Native apps do not send Origin the same way browsers do; allowlist web/admin origins. Use `*` only on local/dev.

## 7) Migrations + seeds

```bash
npm run migrate:dev
npm run migrate:qa
npm run migrate:production

npm run demo:dev   # demos on dev
npm run demo:qa    # demos + App Review account on qa
# Do NOT seed demos on production
```

## 8) Deploy

```bash
npm run deploy:dev
npm run deploy:qa
npm run deploy:production
```

Worker names: `growl-backend-dev`, `growl-backend-qa`, `growl-backend-production`.

Optional custom domains: `api-dev.growl.app`, `api-qa.growl.app`, `api.growl.app`.

## 9) Validate

- `GET /api/v1/health` — DB, KV, and R2 status
- Sign-up → verify email → sign-in
- Forgot password (qa with Resend)
- Demo sign-in on qa: `demo@growl.app` / `GrowlDemo123!`
- Review account on qa: `review@growl.app` / `GrowlReview123!`

## JWT rotation / rollback

1. Put a new `JWT_SECRET` → existing access tokens invalidate immediately.
2. Refresh sessions are hashed in D1; users must sign in again after secret rotation.
3. Keep the previous secret offline until you confirm new deploys; do not commit secrets.

## Stripe webhook

Point Stripe webhooks at:

- qa: `https://<qa-worker>/api/v1/marketplace/webhook`
- production: `https://api.growl.app/api/v1/marketplace/webhook`

Events: `checkout.session.completed`.
