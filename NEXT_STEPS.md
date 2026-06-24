# Next Steps - Implementation Summary

_Last updated: 2026-04-18_

## Completed (high level)

### Backend
- Routes implemented and covered by automated tests (auth, marketplace, stories, instructors, business, profile, feed, comments).
- Stories support with D1 migrations.
- SSO authentication.
- Product CRUD, business dashboard KPIs, orders with line items.
- Order status update endpoint (paired with frontend).

### Frontend
- Redux migration in place.
- Business flows wired: inventory, orders, dashboard.
- Category-based product imagery; product detail and feed images addressed.
- Instructor listing page fixes landed on current branch (`fix/an/gw-hotfix`).

## Immediate next steps (do in order)

### 1. Backend unit tests

Use **Node 18+** (Node **20+** recommended). Vitest does not run on Node 16. With `nvm`:

```bash
nvm use 20   # or 18+
cd backend
npm test
```

### 2. API integration smoke (optional but recommended before release)

Start the worker in another terminal (`cd backend && npm run dev`), **then**:

```bash
cd backend
npm run test:local
```

If nothing is listening on `8787`, health checks will fail with status `0` (connection error).

For a different base URL:

```bash
cd backend
API_BASE_URL=https://your-worker.example/api/v1 npm run test:integration
```

#### Finding your deployed Worker URL

Your HTTP API is a Cloudflare **Worker**. The app and scripts expect the **API prefix** `/api/v1` on that host.

1. **From this repo (default used by the app)**  
   - `frontend/app.config.ts` → `extra.API_BASE_URL` (falls back if env unset).  
   - `frontend/src/services/api/http.ts` → same default: `https://growl-backend.albino-ndreu.workers.dev/api/v1`.  
   That hostname is **`https://<worker-name>.<your-subdomain>.workers.dev`** — here `worker-name` matches `name` in `backend/wrangler.toml` (`growl-backend`). The middle part (`albino-ndreu`) is your Cloudflare account’s **workers.dev subdomain** (Workers & Pages → your worker → subdomains).

2. **After deploy**  
   Run `cd backend && npm run deploy`. Wrangler prints the worker URL (or open **Cloudflare Dashboard → Workers & Pages → growl-backend → Settings → Domains / Triggers**). Use that origin **plus** `/api/v1` for `API_BASE_URL`.

3. **Quick health check in a browser**  
   Open `https://<your-worker-host>/api/v1/health` — you should see JSON with `success` and database status.

4. **Point the mobile app at another environment**  
   Set `API_BASE_URL` when starting Expo (see `app.config.ts`), e.g. `API_BASE_URL=https://growl-backend.<you>.workers.dev/api/v1 npx expo start`.

### 3. Database migrations (if the remote D1 is behind)

```bash
cd backend
npm run migrate
```

This targets your **remote** D1 (`growl-db`). **“No migrations to apply!”** means Wrangler already recorded every file under `migrations/` on that database—nothing is wrong; you only need this step again after you add a new `*.sql` migration.

Use `npm run migrate:local` when developing against the local D1 only.

If local queries fail with **“no such column”** but migrations are up to date, your Miniflare DB was probably created from an older `0001` migration. Reset local D1 and re-apply:

```bash
cd backend
npm run db:reset:local
```

Then restart `npm run dev` (local server is pinned to **port 8787** in `wrangler.toml` for `test:local`).

### 4. Seed products (only if marketplace is empty or you need demo data)

**Remote** seed (needs `wrangler login`; use only if the live marketplace should get demo products):

```bash
cd backend
npm run seed:remote
```

Or the Node helper:

```bash
cd backend
node scripts/seed-products.js
```

For **local** Miniflare only:

```bash
cd backend
npm run seed:local
```

### 5. End-to-end manual checks on device or simulator

- Sign in (including SSO if you rely on it).
- Feed: create post, like, comments if you use them.
- Marketplace: browse, product detail, checkout path you support.
- Business account: dashboard, inventory CRUD, orders list, order status changes.
- Instructors: list loads, detail and vote if applicable.

## Optional enhancements

### Backend
- [ ] Product image upload to R2 (replace URL-only images).
- [ ] Analytics endpoints.
- [ ] Rate limiting.
- [ ] Production-grade JWT signing and verification (if not already strict for your environment).
- [ ] Structured request logging / tracing.

### Frontend
- [x] Connect MarketingScreen to backend APIs (dashboard KPIs, feed posts; campaigns UI still placeholder until an API exists).
- [ ] Product image upload UI (depends on R2 or upload endpoint).
- [ ] Analytics charts on business dashboard.
- [ ] Stronger error handling and retries on flaky networks.
- [ ] Offline-friendly reads/caching where it matters.

## Current status snapshot

| Area | Status |
|------|--------|
| Backend API + Vitest | Run `npm test` (Node 18+) and `npm run test:local` while `npm run dev` is up on port 8787 |
| D1 (local) | If columns are missing, run `npm run db:reset:local` then re-seed if needed |
| Business + orders | Implemented; verify with a real `is_business` user |
| Instructor UX | Recently fixed; re-verify on branch before merge |

## Notes

- Seeded products use category Unsplash URLs unless you add uploads.
- Integration tests expect `API_BASE_URL` (see `backend/tests/test-api.js` and `package.json` scripts).
