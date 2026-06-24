# Deploy Growl Backend to a New Cloudflare Account

This guide moves deployment ownership to a different Cloudflare account and sets up isolated `dev`, `qa`, and `production` environments.

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
npx wrangler d1 create growl-db-dev
npx wrangler d1 create growl-db-qa
npx wrangler d1 create growl-db-prod
```

Copy each `database_id` from command output.

## 3) Create one KV namespace per environment

```bash
npx wrangler kv:namespace create KV_DEV
npx wrangler kv:namespace create KV_QA
npx wrangler kv:namespace create KV_PROD
```

Copy each namespace `id` (and `preview_id` where applicable).

## 4) Update `wrangler.toml` bindings per env

For each named env (`dev`, `qa`, `production`), define dedicated `[[d1_databases]]` and `[[kv_namespaces]]` entries using the IDs from steps 2 and 3.

Recommended pattern:

```toml
[env.dev]
vars = { ENVIRONMENT = "development" }
[[env.dev.d1_databases]]
binding = "DB"
database_name = "growl-db-dev"
database_id = "..."
[[env.dev.kv_namespaces]]
binding = "KV"
id = "..."

[env.qa]
vars = { ENVIRONMENT = "qa" }
[[env.qa.d1_databases]]
binding = "DB"
database_name = "growl-db-qa"
database_id = "..."
[[env.qa.kv_namespaces]]
binding = "KV"
id = "..."

[env.production]
vars = { ENVIRONMENT = "production" }
[[env.production.d1_databases]]
binding = "DB"
database_name = "growl-db-prod"
database_id = "..."
[[env.production.kv_namespaces]]
binding = "KV"
id = "..."
```

## 5) Set secrets per environment

Run these for each environment (`--env dev`, `--env qa`, `--env production`):

```bash
npx wrangler secret put JWT_SECRET --env dev
npx wrangler secret put RESEND_API_KEY --env dev
npx wrangler secret put EMAIL_FROM --env dev
```

Repeat for `qa` and `production`.

## 6) Apply migrations per environment

```bash
npm run migrate:dev
npm run migrate:qa
npm run migrate:production
```

## 7) Deploy workers per environment

```bash
npm run deploy:dev
npm run deploy:qa
npm run deploy:production
```

## 8) Validate each environment

- `GET /api/v1/health`
- Sign-up + verify email + sign-in
- Feed and friends endpoints

## CI recommendation

- Use separate API URLs:
  - `dev`: internal testing
  - `qa`: pre-release verification
  - `production`: live traffic
- Keep separate secrets and databases for data isolation.
