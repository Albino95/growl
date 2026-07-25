# Environment Variables & Configuration

Growl uses **three remote environments**: `dev`, `qa`, and `production` (legacy `staging` removed).
Local `wrangler dev` uses top-level bindings + `.dev.vars`.

See [backend/DEPLOY_NEW_CLOUDFLARE_ACCOUNT.md](../backend/DEPLOY_NEW_CLOUDFLARE_ACCOUNT.md) for company-account cutover and isolated D1/KV/R2 IDs.

## Env matrix

| | local / default | `--env dev` | `--env qa` | `--env production` |
|--|-----------------|-------------|------------|---------------------|
| Worker name | growl-backend | growl-backend-dev | growl-backend-qa | growl-backend-production |
| D1 name | growl-db | growl-db-dev | growl-db-qa | growl-db-prod |
| Demo seeds | yes | yes | yes + review account | **no** |
| Stripe | optional test | optional test | test | live |
| CORS | `*` | `*` | `*` | growl.app allowlist |

Until cutover, `wrangler.toml` may still point all env IDs at the personal-account resources — replace IDs after `npm run db:create:envs`.

## Secrets (never in `[vars]`)

Local: copy `backend/.dev.vars.example` → `backend/.dev.vars`.

Remote (each env):

```bash
npx wrangler secret put JWT_SECRET --env qa
npx wrangler secret put RESEND_API_KEY --env qa
npx wrangler secret put EMAIL_FROM --env qa
npx wrangler secret put STRIPE_SECRET_KEY --env qa
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env qa
# + GOOGLE_CLIENT_ID, APPLE_CLIENT_ID, FACEBOOK_APP_ID, APP_PUBLIC_URL
```

## Frontend (EAS profiles)

| Profile | `APP_ENV` | `API_BASE_URL` | `SHOW_DEMO_ACCOUNTS` |
|---------|-----------|----------------|----------------------|
| development | development | growl-backend-dev… | true |
| preview | qa | growl-backend-qa… | true |
| production | production | growl-backend-production… | false |

Optional: `SENTRY_DSN`, OAuth client IDs, `EAS_PROJECT_ID`.

## Demo / App Review accounts (qa)

| Email | Password | Seed |
|-------|----------|------|
| demo@growl.app | GrowlDemo123! | `npm run demo:qa` |
| instructor@growl.app | GrowlDemo123! | same |
| business@growl.app | GrowlDemo123! | same |
| review@growl.app | GrowlReview123! | `npm run seed:review:qa` |

## Stripe webhook URLs

- qa: `https://<qa-worker>/api/v1/marketplace/webhook`
- production: `https://api.growl.app/api/v1/marketplace/webhook` (or production workers.dev host)

## Health

`GET /api/v1/health` → `database`, `kv`, `r2`, `jwtConfigured`, `paymentsEnabled`.
